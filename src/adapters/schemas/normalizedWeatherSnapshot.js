const { z } = require("zod");

// The shape WeatherAdapter hands back from fetchCurrentConditions() — merged
// into a StationVisit by normalize-and-correlate (§6/§9), never written by
// a railway adapter directly (see normalizedStationVisit.js's exclusion
// note). Deliberately just these two raw fields, nothing derived: whether a
// condition counts as "rain/fog" for the correlation engine's rubric (§10)
// is that engine's decision, not this adapter's — same "adapters stay
// faithful, don't invent business logic" stance as railRadar/mappers.js.
const NormalizedWeatherSnapshot = z.object({
  // Metres. Nullish, not just nullable — OpenWeatherMap omits this field
  // entirely at high visibility rather than sending an explicit value.
  visibilityMeters: z.number().int().nullish(),
  // Raw weather[0].main from OpenWeatherMap ("Rain", "Fog", "Clear", ...).
  // Nullish for the same reason — an empty weather[] array is a documented
  // (if rare) possibility, not a parse error.
  weatherCondition: z.string().nullish(),
});

module.exports = { NormalizedWeatherSnapshot };
