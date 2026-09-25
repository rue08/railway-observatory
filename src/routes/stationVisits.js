const express = require("express");
const prisma = require("../lib/prisma");
const apiKeyAuth = require("../lib/apiKeyAuth");
const { resolveListMode, DEFAULT_LIST_LIMIT } = require("../lib/listQueryMode");

const router = express.Router();

// Auth is per-route, not global: every router.get below must pass apiKeyAuth
// as its 2nd argument (see lib/apiKeyAuth.js for why). A route without it is
// PUBLIC.

/**
 * @openapi
 * /station-visits:
 *   get:
 *     tags: [Station Visits]
 *     summary: List station visits
 *     description: StationVisit rows — the append-only observation log everything else in the system derives from. Unbounded log, not static reference data like Station/Train — see the from/to/whole params.
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Range start (loggedAt), inclusive. Must be paired with `to`.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Range end (loggedAt), inclusive. Must be paired with `from`.
 *       - in: query
 *         name: whole
 *         schema: { type: string, enum: ['true'] }
 *         description: Returns every row, unbounded, when set to "true". Cannot be combined with from/to.
 *     responses:
 *       200:
 *         description: OK — with no params, the 100 most recent rows by loggedAt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 stationVisits:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/StationVisit' }
 *       400:
 *         description: from without to (or vice versa), whole combined with from/to, or an invalid date
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/station-visits", apiKeyAuth, async (req, res) => {
  const result = resolveListMode(req.query);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  let stationVisits;
  if (result.mode === "whole") {
    stationVisits = await prisma.stationVisit.findMany({
      include: { station: true },
      orderBy: { loggedAt: "desc" },
    });
  } else if (result.mode === "range") {
    stationVisits = await prisma.stationVisit.findMany({
      where: { loggedAt: { gte: result.from, lte: result.to } },
      include: { station: true },
      orderBy: { loggedAt: "asc" },
    });
  } else {
    stationVisits = await prisma.stationVisit.findMany({
      include: { station: true },
      orderBy: { loggedAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  res.json({ count: stationVisits.length, stationVisits });
});

/**
 * @openapi
 * /station-visits/{id}:
 *   get:
 *     tags: [Station Visits]
 *     summary: Get station visit
 *     description: One StationVisit row.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stationVisit: { $ref: '#/components/schemas/StationVisit' }
 *       404:
 *         description: No station visit with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/station-visits/:id", apiKeyAuth, async (req, res) => {
  const stationVisit = await prisma.stationVisit.findUnique({
    where: { id: req.params.id },
    include: { station: true },
  });
  if (!stationVisit) {
    return res.status(404).json({ error: `No station visit found for id ${req.params.id}` });
  }
  res.json({ stationVisit });
});

module.exports = router;
