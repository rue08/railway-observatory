const express = require("express");
const prisma = require("../lib/prisma");
const { resolveListMode, DEFAULT_LIST_LIMIT } = require("../lib/listQueryMode");

const router = express.Router();

/**
 * @openapi
 * /news-events:
 *   get:
 *     tags: [News Events]
 *     summary: List news events
 *     description: NewsEvent rows from the Google News matching pipeline (M4). Unbounded log, not static reference data like Station/Train — see the from/to/whole params.
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Range start (publishedAt), inclusive. Must be paired with `to`.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Range end (publishedAt), inclusive. Must be paired with `from`.
 *       - in: query
 *         name: whole
 *         schema: { type: string, enum: ['true'] }
 *         description: Returns every row, unbounded, when set to "true". Cannot be combined with from/to.
 *     responses:
 *       200:
 *         description: OK — with no params, the 100 most recent rows by publishedAt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 newsEvents:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/NewsEvent' }
 *       400:
 *         description: from without to (or vice versa), whole combined with from/to, or an invalid date
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/news-events", async (req, res) => {
  const result = resolveListMode(req.query);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  let newsEvents;
  if (result.mode === "whole") {
    newsEvents = await prisma.newsEvent.findMany({ orderBy: { publishedAt: "desc" } });
  } else if (result.mode === "range") {
    newsEvents = await prisma.newsEvent.findMany({
      where: { publishedAt: { gte: result.from, lte: result.to } },
      orderBy: { publishedAt: "asc" },
    });
  } else {
    newsEvents = await prisma.newsEvent.findMany({
      orderBy: { publishedAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  res.json({ count: newsEvents.length, newsEvents });
});

/**
 * @openapi
 * /news-events/{id}:
 *   get:
 *     tags: [News Events]
 *     summary: Get news event
 *     description: One NewsEvent row, flat (no nested matches).
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
 *                 newsEvent: { $ref: '#/components/schemas/NewsEvent' }
 *       404:
 *         description: No news event with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/news-events/:id", async (req, res) => {
  const newsEvent = await prisma.newsEvent.findUnique({ where: { id: req.params.id } });
  if (!newsEvent) {
    return res.status(404).json({ error: `No news event found for id ${req.params.id}` });
  }
  res.json({ newsEvent });
});

module.exports = router;
