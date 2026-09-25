const express = require("express");
const prisma = require("../lib/prisma");
const apiKeyAuth = require("../lib/apiKeyAuth");

const router = express.Router();

// Auth is per-route, not global: every router.get below must pass apiKeyAuth
// as its 2nd argument (see lib/apiKeyAuth.js for why). A route without it is
// PUBLIC.

/**
 * @openapi
 * /stations:
 *   get:
 *     tags: [Stations]
 *     summary: List stations
 *     description: Every station currently in Postgres. Dev/debug utility — station rows only ever land here as a byproduct of importing a train's schedule via GET /trains/{trainNumber}; there's no RailRadar call behind this route.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 stations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Station' }
 */
// GET /stations — lists every station currently in Postgres. Dev/debug
// utility (confirming what's landed via /trains/:trainNumber imports), not
// an on-demand fetch — there's no RailRadar call behind this route. See
// PROJECT.md §4: Station identity only ever arrives as a byproduct of
// importing a train's schedule, so this is strictly a read of what's
// already there.
router.get("/stations", apiKeyAuth, async (req, res) => {
  const stations = await prisma.station.findMany({ orderBy: { code: "asc" } });
  res.json({ count: stations.length, stations });
});

module.exports = router;
