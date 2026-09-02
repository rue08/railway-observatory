const { Worker } = require("bullmq");
const connection = require("../connection");
const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");
const { normalizeAndCorrelateVisits } = require("../../normalize/stationVisits");

// Job payload: { trainNumber, journeyStatus, serviceDate, sourceProvider,
// stationVisits } — one batch of newly-departed NormalizedStationVisits
// (possibly empty — see normalize/stationVisits.js) for one train, enqueued
// by the ingestion worker (jobs/workers/ingestion.worker.js).
// Persistence/dedupe logic lives in normalize/stationVisits.js, not inline
// here — same split as import/referenceData.js from routes/trains.js, kept
// testable without a real queue involved.
const normalizeAndCorrelateWorker = new Worker(
  "normalize-and-correlate",
  async (job) => {
    const { trainNumber, journeyStatus, serviceDate, sourceProvider, stationVisits } = job.data;

    const result = await normalizeAndCorrelateVisits({
      prisma,
      trainNumber,
      journeyStatus,
      serviceDate,
      sourceProvider,
      stationVisits,
      logger,
    });

    logger.info(
      { jobId: job.id, trainNumber, ...result },
      "Processed normalize-and-correlate job"
    );
  },
  { connection }
);

normalizeAndCorrelateWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, trainNumber: job?.data?.trainNumber, err },
    "Normalize-and-correlate job failed"
  );
});

module.exports = normalizeAndCorrelateWorker;
