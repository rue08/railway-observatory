const express = require("express");
const prisma = require("../lib/prisma");
const redis = require("../lib/redis");

const router = express.Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health
 *     description: Pings Postgres (`SELECT 1`) and Redis (`PING`); healthy only when both respond.
 *     responses:
 *       200:
 *         description: Both dependencies reachable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database: { type: boolean }
 *                     redis: { type: boolean }
 *       503:
 *         description: One or both dependencies unreachable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: degraded }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database: { type: boolean }
 *                     redis: { type: boolean }
 */
// GET /health — checks both stateful dependencies. Returns 200 only when
// both are reachable, 503 otherwise, per PROJECT.md §3's "structured logs +
// /health checks now" decision.
router.get("/health", async (req, res) => {
  const checks = { database: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    req.log.error({ err }, "Health check: database unreachable");
  }

  try {
    const pong = await redis.ping();
    checks.redis = pong === "PONG";
  } catch (err) {
    req.log.error({ err }, "Health check: redis unreachable");
  }

  const healthy = checks.database && checks.redis;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
  });
});

module.exports = router;
