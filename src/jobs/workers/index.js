const logger = require("../../lib/logger");
// Requiring these registers their repeatable jobs (see queues/
// scheduler.queue.js and queues/news.queue.js) — must happen once per
// process start, before the corresponding Workers below are created, so
// each has a tick to fire on.
require("../queues/scheduler.queue");
require("../queues/news.queue");
const ingestionWorker = require("./ingestion.worker");
const normalizeAndCorrelateWorker = require("./normalizeAndCorrelate.worker");
const schedulerWorker = require("./scheduler.worker");
const newsWorker = require("./news.worker");

// Runs as its own process, separate from the Express API server —
// `npm run worker`. Same split most BullMQ deployments use: the web
// process enqueues jobs, this process is the only one that executes them.
logger.info("BullMQ workers started: scheduler, ingestion, normalize-and-correlate, news");

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down workers`);
  await Promise.all([
    schedulerWorker.close(),
    ingestionWorker.close(),
    normalizeAndCorrelateWorker.close(),
    newsWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
