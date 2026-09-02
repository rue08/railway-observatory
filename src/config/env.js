// quiet: true — dotenv v17+ prints a randomized promotional "tip" line to
// stdout on every load (including third-party sponsor plugs), which pollutes
// our otherwise-structured JSON log stream. Suppressed, not just cosmetic.
require("dotenv").config({ quiet: true });

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  // Not validated below like DATABASE_URL/REDIS_URL — only the reference-data
  // import script needs this, not the server/worker, so a missing key
  // shouldn't block those from starting. RailRadarAdapter itself throws a
  // clear error at call time if it's unset.
  railradarApiKey: process.env.RAILRADAR_API_KEY,
  railradarBaseUrl: process.env.RAILRADAR_BASE_URL || "https://api.railradar.in",
};

if (!config.databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set — copy .env.example to .env and fill it in."
  );
}
if (!config.redisUrl) {
  throw new Error(
    "REDIS_URL is not set — copy .env.example to .env and fill it in."
  );
}

module.exports = config;
