const Redis = require("ioredis");
const config = require("../config/env");

// A separate connection from lib/redis.js: BullMQ requires
// maxRetriesPerRequest: null on any connection it manages, since Workers
// issue blocking commands that are incompatible with ioredis's per-request
// retry cap used for the fast-failing /health check. Queues and Workers
// share this one instance — BullMQ duplicates it internally wherever a
// dedicated blocking connection is actually needed.
const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

module.exports = connection;
