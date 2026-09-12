const { Queue } = require("bullmq");
const connection = require("../connection");
const config = require("../../config/env");
const logger = require("../../lib/logger");

const NEWS_JOB_ID = "news-poll-tick";

// Its own queue, deliberately not folded into `ingestion` or driven by the
// same scheduler — §4's design: news isn't gated by any train's active
// window, a disruption notice matters whether or not a tracked train
// happens to be running right now.
const newsQueue = new Queue("news", { connection });

// Same upsertJobScheduler pattern as scheduler.queue.js, same reason:
// idempotent on NEWS_JOB_ID, so a process restart re-upserts the existing
// schedule instead of stacking up duplicate repeat definitions.
newsQueue
  .upsertJobScheduler(
    NEWS_JOB_ID,
    { every: config.newsPollIntervalMinutes * 60 * 1000 },
    { name: "poll", data: {} }
  )
  .catch((err) => {
    logger.error({ err }, "Failed to register the news queue's repeatable poll job");
  });

module.exports = newsQueue;
