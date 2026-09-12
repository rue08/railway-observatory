const { Worker } = require("bullmq");
const connection = require("../connection");
const logger = require("../../lib/logger");
const railRadarAdapter = require("../../lib/railRadarAdapter");
const normalizeAndCorrelateQueue = require("../queues/normalizeAndCorrelate.queue");

// Job payload: { trainNumber, serviceDate }. Deliberately thin — per the
// adapter-isolation pattern (PROJECT.md §5), provider-specific shapes stop
// at fetchLiveStatus and never reach this worker. This worker's whole job
// is fetch + validate + forward: no DB writes, no business logic, no
// correlation. Those live in the normalize-and-correlate worker.
//
// serviceDate is now part of the payload (Sept 13 2026, PROJECT.md §6/§13)
// — the scheduler decides which specific service date(s) need polling and
// passes each one explicitly, rather than this worker asking RailRadar for
// "whatever's live" and hoping it's the instance we meant.
//
// Batched per train, not per station visit: one normalize-and-correlate
// job carries every newly-departed visit for this train, so that worker
// resolves/upserts TrainRun once per batch instead of once per stop.
const ingestionWorker = new Worker(
  "ingestion",
  async (job) => {
    const { trainNumber, serviceDate: requestedServiceDate } = job.data;

    // fetchLiveStatus already filters stationVisits to real, departed stops
    // only — never RailRadar's ETA projections for stops not yet reached
    // (PROJECT.md §5/§6). journeyStatus/serviceDate/sourceProvider are
    // batch-level, not per-visit (Aug 30 2026 contract change — see
    // adapters/railRadar/mappers.js), since a batch can carry zero visits
    // and still need forwarding (see the isCompleted check below).
    // serviceDate below is RailRadar's own response field, not necessarily
    // identical to requestedServiceDate — normalize-and-correlate upserts
    // TrainRun keyed on whatever RailRadar actually reports, same as always.
    const { journeyStatus, serviceDate, sourceProvider, stationVisits } =
      await railRadarAdapter.fetchLiveStatus(trainNumber, requestedServiceDate);

    const isCompleted = journeyStatus === "completed";

    if (stationVisits.length === 0 && !isCompleted) {
      // Not an error: the train may not have started yet, may have nothing
      // new since the last poll, or (untested — see railRadar/schemas.js)
      // may have no live tracking available at all right now.
      logger.info({ trainNumber, journeyStatus }, "No departed station visits to ingest");
      return;
    }

    // Forwarded even with zero visits when isCompleted — a "completed" poll
    // very often has nothing new (every stop already departed on an
    // earlier poll; the terminus itself never reaches "departed" at all),
    // but normalize-and-correlate still needs this job to apply the
    // RUNNING -> COMPLETED flip.
    await normalizeAndCorrelateQueue.add("visit-batch", {
      trainNumber,
      journeyStatus,
      serviceDate,
      sourceProvider,
      stationVisits,
    });

    logger.info(
      { trainNumber, journeyStatus, count: stationVisits.length },
      "Enqueued station visits for normalization"
    );
  },
  { connection }
);

ingestionWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, trainNumber: job?.data?.trainNumber, err }, "Ingestion job failed");
});

module.exports = ingestionWorker;
