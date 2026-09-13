const express = require("express");
const prisma = require("../lib/prisma");
const { resolveListMode, DEFAULT_LIST_LIMIT } = require("../lib/listQueryMode");

const router = express.Router();

/**
 * @openapi
 * /delay-attribution-reasons:
 *   get:
 *     tags: [Delay Attribution Reasons]
 *     summary: List delay attribution reasons
 *     description: DelayAttributionReason rows — one per contributing signal on a DelayAttribution (M5). No timestamp column of its own, so ordering/filtering here goes through the parent DelayAttribution.computedAt for from/to, and plain id descending otherwise.
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Range start on the parent DelayAttribution's computedAt, inclusive. Must be paired with `to`.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Range end on the parent DelayAttribution's computedAt, inclusive. Must be paired with `from`.
 *       - in: query
 *         name: whole
 *         schema: { type: string, enum: ['true'] }
 *         description: Returns every row, unbounded, when set to "true". Cannot be combined with from/to.
 *     responses:
 *       200:
 *         description: OK — with no params, the 100 most recent rows by id
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 delayAttributionReasons:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/DelayAttributionReason' }
 *       400:
 *         description: from without to (or vice versa), whole combined with from/to, or an invalid date
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/delay-attribution-reasons", async (req, res) => {
  const result = resolveListMode(req.query);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  let delayAttributionReasons;
  if (result.mode === "whole") {
    delayAttributionReasons = await prisma.delayAttributionReason.findMany({ orderBy: { id: "desc" } });
  } else if (result.mode === "range") {
    delayAttributionReasons = await prisma.delayAttributionReason.findMany({
      where: { delayAttribution: { computedAt: { gte: result.from, lte: result.to } } },
      orderBy: { delayAttribution: { computedAt: "asc" } },
    });
  } else {
    delayAttributionReasons = await prisma.delayAttributionReason.findMany({
      orderBy: { id: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  res.json({ count: delayAttributionReasons.length, delayAttributionReasons });
});

/**
 * @openapi
 * /delay-attribution-reasons/{id}:
 *   get:
 *     tags: [Delay Attribution Reasons]
 *     summary: Get delay attribution reason
 *     description: One DelayAttributionReason row, flat.
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
 *                 delayAttributionReason: { $ref: '#/components/schemas/DelayAttributionReason' }
 *       404:
 *         description: No delay attribution reason with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/delay-attribution-reasons/:id", async (req, res) => {
  const delayAttributionReason = await prisma.delayAttributionReason.findUnique({
    where: { id: req.params.id },
  });
  if (!delayAttributionReason) {
    return res.status(404).json({ error: `No delay attribution reason found for id ${req.params.id}` });
  }
  res.json({ delayAttributionReason });
});

module.exports = router;
