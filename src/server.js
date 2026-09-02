const app = require("./app");
const config = require("./config/env");
const logger = require("./lib/logger");

const server = app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`);
});

const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = server;
