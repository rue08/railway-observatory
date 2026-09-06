const { Queue } = require("bullmq");
const connection = require("../connection");
const config = require("../../config/env");
const logger = require("../../lib/logger");

const SCHEDULER_JOB_ID = "ingestion-tick";

const schedulerQueue = new Queue("scheduler", { connection });

// Registers (or updates) a repeatable "tick" job — BullMQ's job-scheduler
// API, not the older per-job `repeat` option, specifically because it's
// idempotent on `SCHEDULER_JOB_ID`: calling this again on every process
// restart just re-upserts the same schedule instead of stacking up
// duplicate repeat definitions. The scheduler.worker.js Worker is what
// actually does anything each time this fires; this file only owns getting
// the tick registered.
schedulerQueue
  .upsertJobScheduler(
    SCHEDULER_JOB_ID,
    { every: config.schedulerPollIntervalMinutes * 60 * 1000 },
    { name: "tick", data: {} }
  )
  .catch((err) => {
    logger.error({ err }, "Failed to register the scheduler's repeatable tick job");
  });

module.exports = schedulerQueue;
