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
 * /news-event-matches:
 *   get:
 *     tags: [News Event Matches]
 *     summary: List news event matches
 *     description: NewsEventMatch rows — the NewsEvent-to-StationVisit link table built by newsMatching.js (M4). Unbounded log — see the from/to/whole params.
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Range start (createdAt), inclusive. Must be paired with `to`.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Range end (createdAt), inclusive. Must be paired with `from`.
 *       - in: query
 *         name: whole
 *         schema: { type: string, enum: ['true'] }
 *         description: Returns every row, unbounded, when set to "true". Cannot be combined with from/to.
 *     responses:
 *       200:
 *         description: OK — with no params, the 100 most recent rows by createdAt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 newsEventMatches:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/NewsEventMatch' }
 *       400:
 *         description: from without to (or vice versa), whole combined with from/to, or an invalid date
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/news-event-matches", apiKeyAuth, async (req, res) => {
  const result = resolveListMode(req.query);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  let newsEventMatches;
  if (result.mode === "whole") {
    newsEventMatches = await prisma.newsEventMatch.findMany({ orderBy: { createdAt: "desc" } });
  } else if (result.mode === "range") {
    newsEventMatches = await prisma.newsEventMatch.findMany({
      where: { createdAt: { gte: result.from, lte: result.to } },
      orderBy: { createdAt: "asc" },
    });
  } else {
    newsEventMatches = await prisma.newsEventMatch.findMany({
      orderBy: { createdAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  res.json({ count: newsEventMatches.length, newsEventMatches });
});

/**
 * @openapi
 * /news-event-matches/{id}:
 *   get:
 *     tags: [News Event Matches]
 *     summary: Get news event match
 *     description: One NewsEventMatch row, flat (no nested newsEvent/stationVisit).
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
 *                 newsEventMatch: { $ref: '#/components/schemas/NewsEventMatch' }
 *       404:
 *         description: No news event match with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/news-event-matches/:id", apiKeyAuth, async (req, res) => {
  const newsEventMatch = await prisma.newsEventMatch.findUnique({ where: { id: req.params.id } });
  if (!newsEventMatch) {
    return res.status(404).json({ error: `No news event match found for id ${req.params.id}` });
  }
  res.json({ newsEventMatch });
});

module.exports = router;
