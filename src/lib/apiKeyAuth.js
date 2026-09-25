const crypto = require("crypto");
const config = require("../config/env");

// Per-route guard, NOT global middleware: every protected route must pass it
// explicitly, e.g. `router.get("/thing", apiKeyAuth, handler)`. Only /health,
// /docs and /openapi.json omit it and stay public.
// Deliberate consequence: a NEW ROUTE THAT FORGETS THIS IS PUBLIC. In return,
// unmatched paths never reach this middleware, so they 404 instead of 401 —
// unauthenticated callers can't tell real routes from made-up ones. Don't
// "fix" this by moving it back to a global app.use(apiKeyAuth).
function apiKeyAuth(req, res, next) {
  const provided = req.get("X-API-Key");

  // Constant-time comparison — a plain `!==` would leak how many leading
  // characters matched via response timing. Both sides must be equal
  // length for timingSafeEqual to run at all, so a length mismatch (or a
  // missing header) is rejected before it, still without a timing tell
  // beyond "wrong length", which the key's fixed length would give away.
  const valid =
    typeof provided === "string" &&
    provided.length === config.apiKey.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(config.apiKey));

  if (!valid) {
    return res.status(401).json({ error: "Missing or invalid X-API-Key" });
  }

  next();
}

module.exports = apiKeyAuth;
