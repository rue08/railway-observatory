const express = require("express");
const { apiReference } = require("@scalar/express-api-reference");
const openapiSpec = require("../config/openapi");

const router = express.Router();

// GET /openapi.json — the raw generated spec, same document Scalar renders
// below. Also what "Download OpenAPI Document" in the Scalar UI points at.
router.get("/openapi.json", (req, res) => {
  res.json(openapiSpec);
});

// GET /docs — Scalar's API reference UI, reading the spec from the route
// above rather than a static copy, so it can never drift from it.
// router.get, not router.use: use() matches by prefix, so /docs/anything would
// also serve the UI. get() matches /docs exactly; everything else 404s.
router.get(
  "/docs",
  apiReference({
    url: "/openapi.json",
  })
);

module.exports = router;
