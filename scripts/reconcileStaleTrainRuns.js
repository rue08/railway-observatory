// One-off reconciliation for TrainRun rows stuck at RUNNING/SCHEDULED from
// before the Sept 13 2026 dated-polling fix (PROJECT.md §6/§13) — the
// scheduler used to ask RailRadar for "whatever's live" with no way to
// specify which instance, so a run could get permanently orphaned the
// moment a newer departure took over as "live," stuck open forever with
// its final stops (including the actual terminus arrival) never observed.
//
// This does NOT hand-patch `status` via raw SQL. It re-fetches each stale
// run's own service date from RailRadar (now that `date=` is confirmed as
// the correct request parameter, not `startDate`) and runs the response
// through the exact same normalizeAndCorrelateVisits pipeline live
// ingestion uses — so missing StationVisit rows get backfilled from real
// RailRadar data, `isUnchanged()` correctly skips whatever was already
// recorded, and the terminus-completion backstop (§6/§13) flips `status`
// to COMPLETED itself once the real terminus arrival lands, the same way
// it would have during live tracking. A run that turns out to still be
// genuinely in progress just gets polled once more — harmless, and exactly
// what the redesigned scheduler would do on its own next tick anyway.
//
// Deliberately run WITHOUT a WeatherAdapter. OpenWeatherMap only exposes
// *current* conditions — attaching today's weather to a stop that actually
// happened days ago would be wrong, mislabeled data, not a reasonable
// backfill (PROJECT.md §14: observed data is never presented as something
// it isn't). These backfilled rows are left with null visibilityMeters/
// weatherCondition, same as if weather had simply failed for them live.
//
// Run once, manually: `npm run reconcile`

const prisma = require("../src/lib/prisma");
const railRadarAdapter = require("../src/lib/railRadarAdapter");
const { normalizeAndCorrelateVisits } = require("../src/normalize/stationVisits");
const logger = require("../src/lib/logger");

async function main() {
  const staleRuns = await prisma.trainRun.findMany({
    where: { status: { in: ["RUNNING", "SCHEDULED"] } },
    include: { train: true },
  });

  logger.info({ count: staleRuns.length }, "reconcile: found open TrainRun rows to re-check");

  for (const run of staleRuns) {
    const serviceDateStr = run.serviceDate.toISOString().slice(0, 10);
    const trainNumber = run.train.number;

    try {
      logger.info({ trainNumber, serviceDateStr }, "reconcile: re-fetching from RailRadar");

      const { journeyStatus, serviceDate, sourceProvider, stationVisits } =
        await railRadarAdapter.fetchLiveStatus(trainNumber, serviceDateStr);

      const result = await normalizeAndCorrelateVisits({
        prisma,
        trainNumber,
        journeyStatus,
        serviceDate,
        sourceProvider,
        stationVisits,
        logger,
        // weatherAdapter intentionally omitted — see file header.
      });

      logger.info({ trainNumber, serviceDateStr, ...result }, "reconcile: run updated");
    } catch (err) {
      // One bad run shouldn't abort reconciling the rest — logged and
      // skipped, same "don't let one failure sink an unrelated batch"
      // stance as elsewhere in this pipeline.
      logger.error({ err, trainNumber, serviceDateStr }, "reconcile: failed, skipping this run");
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, "reconcile: fatal error");
  process.exit(1);
});
