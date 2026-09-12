// One-off forced refresh of reference data for the tracked trains — Sept 13
// 2026, alongside reconcileStaleTrainRuns.js (PROJECT.md §6/§13). Needed
// because GET /trains/:trainNumber (routes/trains.js) is cache-first: it
// only calls importTrainSchedule() the first time a train is looked up, so
// a Train row imported before today never picks up two things that landed
// today — Train.destinationCode (didn't exist yet) and RailRadar's current
// RouteStation list, which has itself changed since the original import
// (confirmed against real data: train 12307's route now includes KANL,
// "Khana Link Cabin," a non-halt technical waypoint absent from the
// originally-imported route — see reconcileStaleTrainRuns.js's file header
// for why that absence broke reconciliation).
//
// This calls importTrainSchedule() directly, bypassing that cache-first
// check entirely, so every tracked train's Train/Station/RouteStation rows
// get upserted against RailRadar's current data regardless of whether
// they've ever been imported before. Safe to run repeatedly — upsert-only,
// same as the on-demand path.
//
// Run once, manually, BEFORE reconcile: `npm run reimport`

const prisma = require("../src/lib/prisma");
const railRadarAdapter = require("../src/lib/railRadarAdapter");
const { importTrainSchedule } = require("../src/import/referenceData");
const logger = require("../src/lib/logger");
const config = require("../src/config/env");

async function main() {
  for (const trainNumber of config.trackedTrainNumbers) {
    try {
      logger.info({ trainNumber }, "reimport: fetching fresh schedule from RailRadar");
      const result = await importTrainSchedule({
        prisma,
        adapter: railRadarAdapter,
        trainNumber,
        logger,
      });
      logger.info({ trainNumber, ...result }, "reimport: done");
    } catch (err) {
      // Same "one bad train shouldn't sink the batch" stance as reconcile.
      logger.error({ err, trainNumber }, "reimport: failed, skipping this train");
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, "reimport: fatal error");
  process.exit(1);
});
