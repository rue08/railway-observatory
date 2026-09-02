const { NormalizedStationVisit } = require("../adapters/schemas/normalizedStationVisit");

// Persists one ingestion batch (one train, one or more live station visits)
// into the append-only StationVisit log — PROJECT.md §6/§9. Split out from
// the worker itself, prisma injected rather than imported directly, so this
// stays testable against a fake/mock client with no real DB or queue
// involved — same split as import/referenceData.js from routes/trains.js.
//
// Deliberately does NOT touch Redis (the "current status" cache) or the
// correlation engine (primaryReasonTag stays null — M4/M5 aren't built yet,
// there's no weather/event data to correlate against). Both are scoped as
// separate follow-ups, not part of this pass.

// null and undefined both collapse to null here — a provider (or zod's
// nullish()) may hand back either for "no value", and StationVisit's
// nullable columns don't distinguish the two. Doing this once up front
// means both the change-detection comparison below and the eventual
// Prisma write are comparing/writing the exact same normalized shape.
function withNullsNormalized(visit) {
  return {
    ...visit,
    scheduledArrivalAt: visit.scheduledArrivalAt ?? null,
    scheduledDepartureAt: visit.scheduledDepartureAt ?? null,
    actualArrivalAt: visit.actualArrivalAt ?? null,
    actualDepartureAt: visit.actualDepartureAt ?? null,
    arrivalDelayMinutes: visit.arrivalDelayMinutes ?? null,
    departureDelayMinutes: visit.departureDelayMinutes ?? null,
  };
}

function sameInstant(a, b) {
  const aTime = a ? new Date(a).getTime() : null;
  const bTime = b ? new Date(b).getTime() : null;
  return aTime === bTime;
}

// True if `visit` observes nothing new compared to the newest existing
// StationVisit row for the same (trainRun, stop) — i.e. this poll is a
// repeat of an already-logged observation, not a real change.
function isUnchanged(latest, visit) {
  if (!latest) return false;

  return (
    sameInstant(latest.actualArrivalAt, visit.actualArrivalAt) &&
    sameInstant(latest.actualDepartureAt, visit.actualDepartureAt) &&
    latest.arrivalDelayMinutes === visit.arrivalDelayMinutes &&
    latest.departureDelayMinutes === visit.departureDelayMinutes
  );
}

// { prisma, trainNumber, journeyStatus, serviceDate, sourceProvider,
//   stationVisits, logger } -> { written, skipped, trainRunId }
//
// stationVisits is re-validated here (not just trusted from the ingestion
// worker) because BullMQ round-trips job data through Redis as JSON — dates
// arrive back as strings, not Date instances, and z.coerce.date() is what
// turns them back into real Dates. Same "validate at every boundary" stance
// PROJECT.md §8 already applies to raw adapter output; a queue hop is a
// boundary too. serviceDate is a batch-level field, not read off
// stationVisits[0] (Aug 30 2026 change) — stationVisits can legitimately be
// empty when journeyStatus is "completed", so there'd be nothing to read it
// off otherwise; it still needs its own coercion back to a real Date for
// the same JSON-roundtrip reason.
//
// Missing reference data (Train or Station not found) fails the whole batch
// loudly rather than silently skipping individual visits — see the M3
// planning discussion: ingestion is assumed to only ever target trains
// someone has already looked up via GET /trains/:trainNumber, so a miss
// here means something's genuinely wrong (or reference data hasn't landed
// yet), not a normal case to paper over. Throwing lets BullMQ's existing
// "failed" handler (jobs/workers/normalizeAndCorrelate.worker.js) log it,
// and the transaction wrapping this means a mid-batch failure leaves no
// partial writes behind, same precedent as importTrainSchedule.
async function normalizeAndCorrelateVisits({
  prisma,
  trainNumber,
  journeyStatus,
  serviceDate: rawServiceDate,
  sourceProvider,
  stationVisits: rawVisits,
  logger,
}) {
  const stationVisits = rawVisits.map((v) => withNullsNormalized(NormalizedStationVisit.parse(v)));
  const isCompleted = journeyStatus === "completed";

  if (stationVisits.length === 0 && !isCompleted) {
    return { written: 0, skipped: false };
  }

  const train = await prisma.train.findUnique({ where: { number: trainNumber } });
  if (!train) {
    throw new Error(
      `normalize-and-correlate: no Train found for number ${trainNumber} — reference data ` +
        `hasn't been imported for this train yet (GET /trains/${trainNumber} imports it on demand)`
    );
  }

  const serviceDate = new Date(rawServiceDate);

  return prisma.$transaction(
    async (tx) => {
      const trainRun = await tx.trainRun.upsert({
        where: { trainId_serviceDate: { trainId: train.id, serviceDate } },
        update: {},
        create: {
          trainId: train.id,
          serviceDate,
          status: isCompleted ? "COMPLETED" : "RUNNING",
          sourceProvider,
        },
      });

      // journeyStatus === "completed" wins over everything else — a run
      // that's SCHEDULED or RUNNING graduates straight to COMPLETED the
      // moment RailRadar reports it. Otherwise, a run that already existed
      // as SCHEDULED (from some future producer that pre-creates TrainRuns
      // ahead of departure) graduates to RUNNING the first time an actual
      // visit arrives for it. CANCELLED is left alone here — no confirmed
      // signal for it yet.
      const nextStatus = isCompleted ? "COMPLETED" : trainRun.status === "SCHEDULED" ? "RUNNING" : null;
      if (nextStatus && nextStatus !== trainRun.status) {
        await tx.trainRun.update({ where: { id: trainRun.id }, data: { status: nextStatus } });
      }

      let written = 0;
      for (const visit of stationVisits) {
        const station = await tx.station.findUnique({ where: { code: visit.stationCode } });
        if (!station) {
          throw new Error(
            `normalize-and-correlate: no Station found for code ${visit.stationCode} ` +
              `(train ${trainNumber}) — reference data incomplete`
          );
        }

        const latest = await tx.stationVisit.findFirst({
          where: { trainRunId: trainRun.id, sequenceNumber: visit.sequenceNumber },
          orderBy: { loggedAt: "desc" },
        });

        if (isUnchanged(latest, visit)) continue;

        await tx.stationVisit.create({
          data: {
            trainRunId: trainRun.id,
            stationId: station.id,
            sequenceNumber: visit.sequenceNumber,
            scheduledArrivalAt: visit.scheduledArrivalAt,
            scheduledDepartureAt: visit.scheduledDepartureAt,
            actualArrivalAt: visit.actualArrivalAt,
            actualDepartureAt: visit.actualDepartureAt,
            arrivalDelayMinutes: visit.arrivalDelayMinutes,
            departureDelayMinutes: visit.departureDelayMinutes,
            // Left null — no correlation engine yet (M4/M5 not started).
            primaryReasonTag: null,
            sourceProvider: visit.sourceProvider,
          },
        });
        written++;
      }

      logger?.info(
        {
          trainNumber,
          trainRunId: trainRun.id,
          journeyStatus,
          trainRunStatus: nextStatus ?? trainRun.status,
          received: stationVisits.length,
          written,
        },
        "normalize-and-correlate: batch persisted"
      );

      return { written, skipped: false, trainRunId: trainRun.id };
    },
    // Same generous headroom as importTrainSchedule's transaction, for the
    // same reason: this loop does a handful of sequential queries per
    // visit (Station lookup, latest-StationVisit lookup, the write), and a
    // full-route batch can be a few hundred visits.
    { timeout: 30_000 }
  );
}

module.exports = { normalizeAndCorrelateVisits };
