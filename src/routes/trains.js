const express = require("express");
const prisma = require("../lib/prisma");
const apiKeyAuth = require("../lib/apiKeyAuth");
const railRadarAdapter = require("../lib/railRadarAdapter");
const { importTrainSchedule } = require("../import/referenceData");

const router = express.Router();

// Auth is per-route, not global: every router.get below must pass apiKeyAuth
// as its 2nd argument (see lib/apiKeyAuth.js for why). A route without it is
// PUBLIC.

/**
 * @openapi
 * /trains:
 *   get:
 *     tags: [Trains]
 *     summary: List trains
 *     description: Every train currently in Postgres. Dev/debug utility, same rationale as GET /stations — trains only ever land here as a result of a prior GET /trains/{trainNumber} import, so this is strictly a read of what's already landed, not a fetch from RailRadar.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 trains:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Train' }
 */
// GET /trains — lists every train currently in Postgres. Dev/debug utility,
// same rationale as GET /stations: trains only ever land here as a result
// of a prior GET /trains/:trainNumber import, so this is strictly a read of
// what's already landed, not a fetch from RailRadar.
router.get("/trains", apiKeyAuth, async (req, res) => {
  const trains = await prisma.train.findMany({ orderBy: { number: "asc" } });
  res.json({ count: trains.length, trains });
});

/**
 * @openapi
 * /trains/{trainNumber}:
 *   get:
 *     tags: [Trains]
 *     summary: Get train
 *     description: Returns the train's stored schedule if already imported; otherwise fetches it from RailRadar once, upserts Train/Station/RouteStation, then returns it. Repeat requests for the same train never call RailRadar again since schedule data is static.
 *     parameters:
 *       - in: path
 *         name: trainNumber
 *         required: true
 *         schema: { type: string, pattern: '^\d{4,5}$' }
 *         description: 4-5 digit train number
 *         example: '12301'
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 train: { $ref: '#/components/schemas/Train' }
 *                 route:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/RouteStation' }
 *       400:
 *         description: trainNumber isn't 4-5 digits
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: No such train at RailRadar
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: RailRadar fetch failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /trains/:trainNumber — cache-first. Returns the train's stored
// schedule if it's already been imported; otherwise fetches it from
// RailRadar once, upserts it (Train/Station/RouteStation — see
// importTrainSchedule, PROJECT.md §4/§9), then returns it. Repeat requests
// for the same train never call RailRadar again, since schedule data is
// static — this replaces the old hardcoded handpickedTrains.js batch import.
router.get("/trains/:trainNumber", apiKeyAuth, async (req, res) => {
  const { trainNumber } = req.params;

  // Reject obviously-invalid input before spending a RailRadar call on it —
  // docs describe train numbers as 5-digit, but a few well-known 4-digit
  // numbers exist historically, so this stays a loose format check, not a
  // strict length match.
  if (!/^\d{4,5}$/.test(trainNumber)) {
    return res.status(400).json({ error: "trainNumber must be 4-5 digits" });
  }

  try {
    // Checks for at least one RouteStation, not just the Train row — a
    // Train can exist with zero RouteStations from a partial import (see
    // importTrainSchedule's now-transactional write; this check is the
    // other half of that same fix, in case a partial state ever recurs
    // some other way). Without it, a train stuck in that state would
    // silently serve an empty route forever, never retrying.
    const existing = await prisma.train.findUnique({
      where: { number: trainNumber },
      include: { routeStations: { select: { id: true }, take: 1 } },
    });

    let train;
    if (!existing || existing.routeStations.length === 0) {
      const result = await importTrainSchedule({
        prisma,
        adapter: railRadarAdapter,
        trainNumber,
        logger: req.log,
      });
      train = result.train;
    } else {
      // Strip the probe-only routeStations field before it's the response shape.
      const { routeStations: _probe, ...trainWithoutProbe } = existing;
      train = trainWithoutProbe;
    }

    const route = await prisma.routeStation.findMany({
      where: { trainId: train.id },
      include: { station: true },
      orderBy: { sequenceNumber: "asc" },
    });

    res.json({ train, route });
  } catch (err) {
    if (err.upstreamStatus === 404) {
      return res.status(404).json({ error: `No train found for number ${trainNumber}` });
    }

    req.log.error({ err, trainNumber }, "Failed to fetch train schedule");
    res.status(502).json({ error: "Failed to fetch train schedule from RailRadar" });
  }
});

module.exports = router;
