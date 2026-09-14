const express = require("express");
const prisma = require("../lib/prisma");
const { resolveListMode, DEFAULT_LIST_LIMIT } = require("../lib/listQueryMode");

const router = express.Router();

/**
 * @openapi
 * /train-runs:
 *   get:
 *     tags: [Train Runs]
 *     summary: List train runs
 *     description: TrainRun rows — one per train actually running on a given serviceDate. Unbounded log, not static reference data like Station/Train — see the from/to/whole params.
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
 *                 trainRuns:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/TrainRun' }
 *       400:
 *         description: from without to (or vice versa), whole combined with from/to, or an invalid date
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/train-runs", async (req, res) => {
  const result = resolveListMode(req.query);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  let trainRuns;
  if (result.mode === "whole") {
    trainRuns = await prisma.trainRun.findMany({ orderBy: { createdAt: "desc" } });
  } else if (result.mode === "range") {
    trainRuns = await prisma.trainRun.findMany({
      where: { createdAt: { gte: result.from, lte: result.to } },
      orderBy: { createdAt: "asc" },
    });
  } else {
    trainRuns = await prisma.trainRun.findMany({
      orderBy: { createdAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  res.json({ count: trainRuns.length, trainRuns });
});

/**
 * @openapi
 * /train-runs/{id}:
 *   get:
 *     tags: [Train Runs]
 *     summary: Get train run
 *     description: One TrainRun row.
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
 *                 trainRun: { $ref: '#/components/schemas/TrainRun' }
 *       404:
 *         description: No train run with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/train-runs/:id", async (req, res) => {
  const trainRun = await prisma.trainRun.findUnique({ where: { id: req.params.id } });
  if (!trainRun) {
    return res.status(404).json({ error: `No train run found for id ${req.params.id}` });
  }
  res.json({ trainRun });
});

module.exports = router;
