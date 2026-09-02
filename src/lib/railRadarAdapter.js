const { RailRadarAdapter } = require("../adapters/railRadarAdapter");

// Singleton — same rationale as lib/prisma.js: one instance reused across
// route handlers instead of constructing a new one per request.
const railRadarAdapter = new RailRadarAdapter();

module.exports = railRadarAdapter;
