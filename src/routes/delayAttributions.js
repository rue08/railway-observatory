const express = require("express");
const prisma = require("../lib/prisma");
const { resolveListMode, DEFAULT_LIST_LIMIT } = require("../lib/listQueryMode");

const router = express.Router();

/**
 * @openapi
 * /delay-attributions:
 *   get:
 *     tags: [Delay Attributions]
 *     summary: List delay attributions
 *     description: DelayAttribution rows — the scored-correlation engine's output (M5). Append-only, unbounded — see the from/to/whole params.
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Range start (computedAt), inclusive. Must be paired with `to`.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Range end (computedAt), inclusive. Must be paired with `from`.
 *       - in: query
 *         name: whole
 *         schema: { type: string, enum: ['true'] }
 *         description: Returns every row, unbounded, when set to "true". Cannot be combined with from/to.
 *     responses:
 *       200:
 *         description: OK — with no params, the 100 most recent rows by computedAt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 delayAttributions:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/DelayAttribution' }
 *       400:
 *         description: from without to (or vice versa), whole combined with from/to, or an invalid date
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/delay-attributions", async (req, res) => {
  const result = resolveListMode(req.query);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  let delayAttributions;
  if (result.mode === "whole") {
    delayAttributions = await prisma.delayAttribution.findMany({ orderBy: { computedAt: "desc" } });
  } else if (result.mode === "range") {
    delayAttributions = await prisma.delayAttribution.findMany({
      where: { computedAt: { gte: result.from, lte: result.to } },
      orderBy: { computedAt: "asc" },
    });
  } else {
    delayAttributions = await prisma.delayAttribution.findMany({
      orderBy: { computedAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  res.json({ count: delayAttributions.length, delayAttributions });
});

/**
 * @openapi
 * /delay-attributions/{id}:
 *   get:
 *     tags: [Delay Attributions]
 *     summary: Get delay attribution
 *     description: One DelayAttribution row, flat (no nested reasons).
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
 *                 delayAttribution: { $ref: '#/components/schemas/DelayAttribution' }
 *       404:
 *         description: No delay attribution with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/delay-attributions/:id", async (req, res) => {
  const delayAttribution = await prisma.delayAttribution.findUnique({ where: { id: req.params.id } });
  if (!delayAttribution) {
    return res.status(404).json({ error: `No delay attribution found for id ${req.params.id}` });
  }
  res.json({ delayAttribution });
});

module.exports = router;
