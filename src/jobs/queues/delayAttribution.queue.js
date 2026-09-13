const { Queue } = require("bullmq");
const connection = require("../connection");
const config = require("../../config/env");
const logger = require("../../lib/logger");

const DELAY_ATTRIBUTION_JOB_ID = "delay-attribution-tick";

// Its own queue, same reasoning as news's — recomputation needs to run on
// its own cadence regardless of which train poll or news poll just fired,
// scanning whatever new NewsEventMatch rows have landed since the last
// tick (PROJECT.md §10).
const delayAttributionQueue = new Queue("delay-attribution", { connection });

// Same upsertJobScheduler pattern as news.queue.js/scheduler.queue.js:
// idempotent on DELAY_ATTRIBUTION_JOB_ID, so a process restart re-upserts
// the existing schedule instead of stacking up duplicate repeat
// definitions.
delayAttributionQueue
  .upsertJobScheduler(
    DELAY_ATTRIBUTION_JOB_ID,
    { every: config.delayAttributionPollIntervalMinutes * 60 * 1000 },
    { name: "compute", data: {} }
  )
  .catch((err) => {
    logger.error({ err }, "Failed to register the delay-attribution queue's repeatable job");
  });

module.exports = delayAttributionQueue;
