const express = require("express");
const prisma = require("../lib/prisma");
const apiKeyAuth = require("../lib/apiKeyAuth");

const router = express.Router();

// Auth is per-route, not global: every router.get below must pass apiKeyAuth
// as its 2nd argument (see lib/apiKeyAuth.js for why). A route without it is
// PUBLIC.

/**
 * @openapi
 * /routestation:
 *   get:
 *     tags: [Route Stations]
 *     summary: Get stops
 *     description: RouteStation rows for one train, joined with their Station, sorted by sequenceNumber. Same identifier convention as GET /trains/{trainNumber} — trainId is the public train *number*, not the internal Train.id.
 *     parameters:
 *       - in: query
 *         name: trainId
 *         required: true
 *         schema: { type: string, pattern: '^\d{4,5}$' }
 *         description: The train's public number (4-5 digits)
 *         example: '12301'
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trainNumber: { type: string }
 *                 count: { type: integer }
 *                 routeStations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/RouteStation' }
 *       400:
 *         description: trainId missing or not 4-5 digits
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: No train with that number
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /routestation?trainId=<train number> — the ordered stop list for one
// train: RouteStation rows joined with their Station, sorted by
// sequenceNumber. Same identifier convention as GET /trains/:trainNumber —
// trainId here is the public train *number*, not the internal Train.id, so
// callers never need to know the internal id shape.
router.get("/routestation", apiKeyAuth, async (req, res) => {
  const { trainId: trainNumber } = req.query;

  if (!trainNumber || !/^\d{4,5}$/.test(trainNumber)) {
    return res.status(400).json({ error: "trainId query param must be a 4-5 digit train number" });
  }

  const train = await prisma.train.findUnique({ where: { number: trainNumber } });
  if (!train) {
    return res.status(404).json({ error: `No train found for number ${trainNumber}` });
  }

  const routeStations = await prisma.routeStation.findMany({
    where: { trainId: train.id },
    include: { station: true },
    orderBy: { sequenceNumber: "asc" },
  });

  res.json({ trainNumber, count: routeStations.length, routeStations });
});

module.exports = router;
