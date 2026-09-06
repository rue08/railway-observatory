const logger = require("../../lib/logger");
// Requiring this registers the repeatable "tick" job (see queues/
// scheduler.queue.js) — must happen once per process start, before the
// scheduler Worker below is created, so a tick has something to fire on.
require("../queues/scheduler.queue");
const ingestionWorker = require("./ingestion.worker");
const normalizeAndCorrelateWorker = require("./normalizeAndCorrelate.worker");
const schedulerWorker = require("./scheduler.worker");

// Runs as its own process, separate from the Express API server —
// `npm run worker`. Same split most BullMQ deployments use: the web
// process enqueues jobs, this process is the only one that executes them.
logger.info("BullMQ workers started: scheduler, ingestion, normalize-and-correlate");

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down workers`);
  await Promise.all([
    schedulerWorker.close(),
    ingestionWorker.close(),
    normalizeAndCorrelateWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
