const { Worker } = require("bullmq");
const connection = require("../connection");
const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");
const config = require("../../config/env");
const ingestionQueue = require("../queues/ingestion.queue");
const { isTrainActiveNow } = require("../../scheduler/activeWindow");

// Fires on config.schedulerPollIntervalMinutes (see queues/scheduler.queue.js
// for how the repeat itself gets registered). Each tick: for every tracked
// train number (config.trackedTrainNumbers), check whether it's actually
// inside its scheduled run window right now, and only enqueue an ingestion
// poll for the ones that are — this is the whole point of the scheduler
// existing at all, see docs/tracked-trains.md for the quota this is
// protecting.
//
// Deliberately thin, same rationale as ingestion.worker.js: no RailRadar
// calls happen here, only a Postgres read (already-imported schedule data)
// and, when due, a queue.add — the actual fetch stays entirely in the
// ingestion worker downstream.
const schedulerWorker = new Worker(
  "scheduler",
  async () => {
    for (const trainNumber of config.trackedTrainNumbers) {
      const train = await prisma.train.findUnique({
        where: { number: trainNumber },
        include: { routeStations: { orderBy: { sequenceNumber: "asc" } } },
      });

      if (!train || train.routeStations.length === 0) {
        // Not imported yet — GET /trains/:trainNumber hasn't been hit for
        // this number, so there's no schedule to compute a window from.
        // Not an error: this is expected until someone looks it up once.
        logger.warn(
          { trainNumber },
          "Scheduler: tracked train has no imported schedule yet — skipping tick"
        );
        continue;
      }

      if (!isTrainActiveNow({ train, routeStations: train.routeStations })) {
        continue; // outside its run window (or not a run day) — no poll
      }

      await ingestionQueue.add("poll", { trainNumber });
      logger.info({ trainNumber }, "Scheduler: enqueued ingestion poll");
    }
  },
  { connection }
);

schedulerWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Scheduler tick failed");
});

module.exports = schedulerWorker;
