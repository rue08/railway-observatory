const crypto = require("crypto");
const config = require("../config/env");

// Guards every route mounted after it in app.js — /health, /docs, and
// /openapi.json are deliberately mounted before this middleware, so they
// stay public; everything mounted after it requires a matching X-API-Key
// header. New routes are protected by default just by where they're
// registered, no per-route opt-in needed.
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
