const express = require("express");
const pinoHttp = require("pino-http");
const logger = require("./lib/logger");
const healthRouter = require("./routes/health");
const trainsRouter = require("./routes/trains");
const trainsLiveRouter = require("./routes/trainsLive");
const stationsRouter = require("./routes/stations");
const routeStationRouter = require("./routes/routeStation");
const stationVisitsRouter = require("./routes/stationVisits");
const trainRunsRouter = require("./routes/trainRuns");
const newsEventsRouter = require("./routes/newsEvents");
const newsEventMatchesRouter = require("./routes/newsEventMatches");
const delayAttributionsRouter = require("./routes/delayAttributions");
const delayAttributionReasonsRouter = require("./routes/delayAttributionReasons");
const docsRouter = require("./routes/docs");
const apiKeyAuth = require("./lib/apiKeyAuth");

const app = express();

// Attaches req.log (a child logger) and logs one structured line per request.
app.use(pinoHttp({ logger }));
app.use(express.json());

// Public — no X-API-Key required. Order matters here: everything mounted
// below apiKeyAuth is protected by it, so a new route only stays public by
// being deliberately added above this line, never the other way around.
app.use(healthRouter);
app.use(docsRouter);

app.use(apiKeyAuth);

app.use(trainsRouter);
app.use(trainsLiveRouter);
app.use(stationsRouter);
app.use(routeStationRouter);
app.use(stationVisitsRouter);
app.use(trainRunsRouter);
app.use(newsEventsRouter);
app.use(newsEventMatchesRouter);
app.use(delayAttributionsRouter);
app.use(delayAttributionReasonsRouter);

// 404 — no route matched.
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Central error handler. Must keep all 4 args — Express only treats a
// middleware as an error handler when its signature has this arity.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  (req.log || logger).error({ err }, "Unhandled error");
  res.status(err.status || 500).json({ error: "Internal server error" });
});

module.exports = app;
