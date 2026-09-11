const { NormalizedWeatherSnapshot } = require("../schemas");

// Maps a raw OpenWeatherMap Current Weather Data (v2.5) response onto our
// shared NormalizedWeatherSnapshot shape. Split out from weatherAdapter.js
// itself, same precedent as railRadar/mappers.js — keeps the parsing
// testable against fixture JSON with no real HTTP call involved.
//
// `visibility` is metres, omitted by OpenWeatherMap entirely at high
// visibility rather than sent as an explicit value — `?? null` covers both
// "field absent" and "field present but null". `weather` is documented as
// an array (rarely more than one entry); an empty array is a real,
// if uncommon, possibility, not something to throw on.
function mapCurrentWeather(rawJson) {
  return NormalizedWeatherSnapshot.parse({
    visibilityMeters: rawJson.visibility ?? null,
    weatherCondition: rawJson.weather?.[0]?.main ?? null,
  });
}

module.exports = { mapCurrentWeather };
