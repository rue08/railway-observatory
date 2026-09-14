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
  // Same non-validated stance as railradarApiKey — only normalize-and-
  // correlate's weather enrichment needs this, not the server/worker
  // startup path, so a missing key shouldn't block those. WeatherAdapter
  // throws a clear error at call time if it's unset.
  openWeatherMapApiKey: process.env.OPENWEATHERMAP_API_KEY,
  // The scheduler's tracked list — the only trains it ever polls, and the
  // only ones GET /trains/:trainNumber/live will serve (see routes/
  // trainsLive.js). Comma-separated train numbers, e.g. "12307,12308".
  // Currently just the Jodhpur<->Howrah pair — quota math for this exact
  // list lives in docs/tracked-trains.md.
  trackedTrainNumbers: (process.env.TRACKED_TRAINS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean),
  // Minutes between scheduler ticks. 75 was chosen specifically for the
  // 12307/12308 pair (~823 calls/month, ~177 headroom under RailRadar's
  // 1,000/month free-tier cap) — see docs/tracked-trains.md. Re-check that
  // math before changing the tracked list without changing this.
  schedulerPollIntervalMinutes: parseInt(process.env.SCHEDULER_POLL_INTERVAL_MINUTES, 10) || 75,
  // Hourly by default, per §4's design — news isn't gated by any train's
  // active window (a disruption notice matters whether or not a tracked
  // train happens to be running), so this has no relationship to
  // schedulerPollIntervalMinutes above.
  newsPollIntervalMinutes: parseInt(process.env.NEWS_POLL_INTERVAL_MINUTES, 10) || 60,
  // M5 (PROJECT.md §10) — how often the delay-attribution engine re-scans
  // delayed StationVisits for new evidence. Hourly by default, matching
  // newsPollIntervalMinutes above: news is the only thing that can arrive
  // *after* a visit is first written (weather is a write-once snapshot at
  // the same moment), so there's little value polling faster than news
  // itself does.
  delayAttributionPollIntervalMinutes:
    parseInt(process.env.DELAY_ATTRIBUTION_POLL_INTERVAL_MINUTES, 10) || 60,
  // Shared secret for the X-API-Key header — validated below like
  // DATABASE_URL/REDIS_URL, not left unvalidated like railradarApiKey/
  // openWeatherMapApiKey, since apiKeyAuth.js guards nearly every route and
  // a missing value would otherwise 401 the whole API at request time
  // instead of failing loudly at startup.
  apiKey: process.env.API_KEY,
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
if (!config.apiKey) {
  throw new Error(
    "API_KEY is not set — copy .env.example to .env and fill it in."
  );
}

module.exports = config;
