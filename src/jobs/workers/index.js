const logger = require("../../lib/logger");
const ingestionWorker = require("./ingestion.worker");
const normalizeAndCorrelateWorker = require("./normalizeAndCorrelate.worker");

// Runs as its own process, separate from the Express API server —
// `npm run worker`. Same split most BullMQ deployments use: the web
// process enqueues jobs, this process is the only one that executes them.
logger.info("BullMQ workers started: ingestion, normalize-and-correlate");

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down workers`);
  await Promise.all([
    ingestionWorker.close(),
    normalizeAndCorrelateWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
