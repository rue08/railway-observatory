const { Worker } = require("bullmq");
const connection = require("../connection");
const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");
const { computeAttribution, isAttributionUnchanged } = require("../../normalize/delayAttribution");

// Bounds the candidate scan to visits logged recently. NewsEventMatch rows
// are only ever created within a ±1hr window of the visit itself
// (normalize/newsMatching.js), so evidence arriving more than a few days
// after a delay isn't a realistic scenario worth scanning for forever —
// this keeps the query cheap indefinitely instead of scaling with total
// StationVisit history. Revisit if that matching-window assumption changes.
const RECOMPUTE_WINDOW_DAYS = 7;

// A delayed visit needs (re)computation if it has never been scored, or if
// a NewsEventMatch has landed since its last DelayAttribution was computed
// — weather can't change after the fact (write-once, same moment as the
// visit itself), so news arriving later is the only reason to revisit one.
async function findVisitsNeedingAttribution() {
  const since = new Date(Date.now() - RECOMPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const delayedVisits = await prisma.stationVisit.findMany({
    where: {
      loggedAt: { gte: since },
      OR: [{ arrivalDelayMinutes: { gt: 0 } }, { departureDelayMinutes: { gt: 0 } }],
    },
    include: {
      station: true,
      newsMatches: { include: { newsEvent: true } },
      delayAttributions: {
        orderBy: { computedAt: "desc" },
        take: 1,
        include: { reasons: true },
      },
    },
  });

  return delayedVisits.filter((visit) => {
    const latest = visit.delayAttributions[0];
    if (!latest) return true; // never scored

    const newestMatchAt = visit.newsMatches.reduce(
      (max, match) => (match.createdAt > max ? match.createdAt : max),
      new Date(0)
    );
    return newestMatchAt > latest.computedAt;
  });
}

// Job payload: {} — same as news's, nothing to parameterize per tick. Each
// firing scans every delayed visit that might need (re)scoring and figures
// out for itself which ones actually changed.
const delayAttributionWorker = new Worker(
  "delay-attribution",
  async () => {
    const visits = await findVisitsNeedingAttribution();

    let written = 0;
    for (const visit of visits) {
      const { reasons, totalScore, primaryReasonTag, confidenceTier } = computeAttribution(visit);
      const latest = visit.delayAttributions[0];

      // Append-only, same convention as StationVisit — write a new row
      // only when the computed result actually differs from the last one,
      // never overwrite in place. See normalize/delayAttribution.js's
      // isAttributionUnchanged and PROJECT.md §10's worked example.
      if (isAttributionUnchanged(latest?.reasons, reasons)) continue;

      await prisma.delayAttribution.create({
        data: {
          stationVisitId: visit.id,
          primaryReasonTag,
          confidenceTier,
          totalScore,
          reasons: { create: reasons },
        },
      });
      written++;
    }

    logger.info({ scanned: visits.length, written }, "Delay-attribution tick processed");
  },
  { connection }
);

delayAttributionWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Delay-attribution job failed");
});

module.exports = delayAttributionWorker;
