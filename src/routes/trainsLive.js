const express = require("express");
const prisma = require("../lib/prisma");
const apiKeyAuth = require("../lib/apiKeyAuth");
const config = require("../config/env");

const router = express.Router();

// Auth is per-route, not global: every router.get below must pass apiKeyAuth
// as its 2nd argument (see lib/apiKeyAuth.js for why). A route without it is
// PUBLIC.

/**
 * @openapi
 * /trains/{trainNumber}/live:
 *   get:
 *     tags: [Trains]
 *     summary: Get live status
 *     description: Current live status for a tracked train — the newest StationVisit row for its most recent TrainRun, read straight from Postgres (no cache layer; not needed at this scale, see PROJECT.md's M3 notes). Only ever populated by the ingestion scheduler, so only trains on the tracked list (config.trackedTrainNumbers / TRACKED_TRAINS) are served here at all — everyone else gets a 404, on purpose, not a fallback fetch.
 *     parameters:
 *       - in: path
 *         name: trainNumber
 *         required: true
 *         schema: { type: string, pattern: '^\d{4,5}$' }
 *         example: '12308'
 *     responses:
 *       200:
 *         description: OK — tracked train, may or may not have data yet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trainNumber: { type: string }
 *                 journeyStatus: { type: string, nullable: true, description: "TrainRun.status, or null if no run has been observed yet" }
 *                 serviceDate: { type: string, format: date, nullable: true }
 *                 latestVisit:
 *                   nullable: true
 *                   allOf: [{ $ref: '#/components/schemas/StationVisit' }]
 *       400:
 *         description: trainNumber isn't 4-5 digits
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: trainNumber isn't on the tracked list — live status is never available for it
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /trains/:trainNumber/live — reads whatever the ingestion scheduler
// has already collected; never triggers a fetch itself (see the "why does
// hitting this endpoint not start tracking a train" discussion — that's a
// deliberate, separate design choice, not a gap). A trainNumber outside
// config.trackedTrainNumbers is rejected outright: nothing ever polls it,
// so there's nothing this endpoint could ever honestly return for it.
router.get("/trains/:trainNumber/live", apiKeyAuth, async (req, res) => {
  const { trainNumber } = req.params;

  if (!/^\d{4,5}$/.test(trainNumber)) {
    return res.status(400).json({ error: "trainNumber must be 4-5 digits" });
  }

  if (!config.trackedTrainNumbers.includes(trainNumber)) {
    return res.status(404).json({
      error: `Train ${trainNumber} is not on the tracked list — live status is only available for actively-polled trains (${config.trackedTrainNumbers.join(", ")}).`,
    });
  }

  const train = await prisma.train.findUnique({ where: { number: trainNumber } });
  if (!train) {
    // Tracked by config, but never imported/observed yet — the scheduler
    // skips it until GET /trains/:trainNumber has run once (see
    // scheduler.worker.js). Distinct from the 404 above: this train *will*
    // eventually have data, it just doesn't yet.
    return res.json({ trainNumber, journeyStatus: null, serviceDate: null, latestVisit: null });
  }

  const trainRun = await prisma.trainRun.findFirst({
    where: { trainId: train.id },
    orderBy: { serviceDate: "desc" },
  });

  if (!trainRun) {
    return res.json({ trainNumber, journeyStatus: null, serviceDate: null, latestVisit: null });
  }

  const latestVisit = await prisma.stationVisit.findFirst({
    where: { trainRunId: trainRun.id },
    orderBy: { loggedAt: "desc" },
    include: { station: true },
  });

  res.json({
    trainNumber,
    journeyStatus: trainRun.status,
    serviceDate: trainRun.serviceDate,
    latestVisit,
  });
});

module.exports = router;
