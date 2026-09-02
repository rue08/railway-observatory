const Redis = require("ioredis");
const config = require("../config/env");
const logger = require("./logger");

// lazyConnect: don't open the connection at module-load time — connect on first
// command instead (issued by the /health check). Keeps a Redis hiccup from
// crashing the process before Express even starts listening.
const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

module.exports = redis;
