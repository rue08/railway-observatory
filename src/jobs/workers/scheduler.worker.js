const { Worker } = require("bullmq");
const connection = require("../connection");
const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");
const config = require("../../config/env");
const ingestionQueue = require("../queues/ingestion.queue");
const { hasTodaysDepartureStarted, todayIstDateString } = require("../../scheduler/activeWindow");

// Fires on config.schedulerPollIntervalMinutes (see queues/scheduler.queue.js
// for how the repeat itself gets registered). Each tick, per tracked train,
// figures out every *service date* that needs polling right now and
// enqueues one dated poll per date — not one poll per train number the way
// this used to work.
//
// Redesigned Sept 13 2026 (PROJECT.md §6/§13) to fix a real data-loss bug:
// 12307/12308 departs daily but the journey takes 29h45m, so on the
// back-to-back-day departures (~5h45m of overlap each time), two physical
// instances are genuinely in flight at once. The old design asked RailRadar
// "what's live for this train number" with no way to specify which
// instance — the moment a newer departure became "the" live one, the older
// instance (sometimes with under 10 stops left, including its actual
// terminus arrival) stopped receiving any further polls and got stuck at
// RUNNING forever. Confirmed against real data: 12307's Sept-5 run reached
// sequence 297 of 306 and was never polled again once Sept-6's run started
// ~75 minutes later.
//
// The fix: poll every TrainRun that isn't COMPLETED yet, each pinned to its
// own serviceDate (RailRadar's /live confirmed to accept one, Sept 13
// 2026), rather than the single most-recently-created one — "poll only the
// latest" would just relocate the exact same bug to our own side instead
// of RailRadar's. In steady state (no overlap) this is still one poll per
// train; only during the actual overlap window does it become two, and
// nothing here has to specifically detect that it's happening.
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
        // this number, so there's no schedule to compute anything from.
        // Not an error: this is expected until someone looks it up once.
        logger.warn(
          { trainNumber },
          "Scheduler: tracked train has no imported schedule yet — skipping tick"
        );
        continue;
      }

      // Every run we already know about that hasn't finished — this is
      // what replaces the old backward-searching "could a run from a
      // previous day still be active" loop. The database already knows
      // exactly which runs are open; there's no need to re-derive it from
      // schedule arithmetic.
      const openRuns = await prisma.trainRun.findMany({
        where: { trainId: train.id, status: { in: ["SCHEDULED", "RUNNING"] } },
        select: { serviceDate: true },
      });

      const datesToPoll = new Set(
        openRuns.map((run) => run.serviceDate.toISOString().slice(0, 10))
      );

      // Today's own departure, if it's due and doesn't have a TrainRun yet
      // — the one piece of schedule-based gating that still has to exist,
      // or we'd start polling for today's run at midnight, hours before it
      // actually departs.
      const origin = train.routeStations[0];
      // IST, not a naive UTC slice — see todayIstDateString's own comment
      // for why that distinction matters right at this exact boundary.
      const todayStr = todayIstDateString();
      if (hasTodaysDepartureStarted({ train, origin }) && !datesToPoll.has(todayStr)) {
        datesToPoll.add(todayStr);
      }

      for (const serviceDate of datesToPoll) {
        await ingestionQueue.add("poll", { trainNumber, serviceDate });
        logger.info({ trainNumber, serviceDate }, "Scheduler: enqueued ingestion poll");
      }
    }
  },
  { connection }
);

schedulerWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Scheduler tick failed");
});

module.exports = schedulerWorker;
