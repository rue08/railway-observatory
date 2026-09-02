const pino = require("pino");
const config = require("../config/env");

// Plain newline-delimited JSON output — no pino-pretty transport, kept dependency-free
// per the project's low-ceremony stance. Pipe through `pino-pretty` locally if you want
// colorized output: `node src/server.js | npx pino-pretty`.
const logger = pino({
  level: config.nodeEnv === "production" ? "info" : "debug",
});

module.exports = logger;
