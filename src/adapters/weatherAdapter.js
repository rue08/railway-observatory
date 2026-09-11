const config = require("../config/env");
const { mapCurrentWeather } = require("./openWeatherMap/mappers");

// The classic Current Weather Data endpoint (v2.5) — not One Call 4.0
// (/data/4.0/onecall). One Call is a separate, metered "pay per call
// beyond 1,000/day" product; the classic endpoint is free at 60 calls/min
// and 1,000,000/month with no billing details on file, and already returns
// everything we need (visibility, weather[].main) for a point-in-time
// current-conditions snapshot. Decided Sept 12 2026 — see PROJECT.md §4.
const CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";

// Fulfils the weather half of the shared adapter contract from PROJECT.md
// §5 — one call per (lat, lng), no train/station concept of its own. Kept
// as its own adapter (not folded into RailRadarAdapter) since it's a
// genuinely separate provider with its own auth scheme and failure modes.
class WeatherAdapter {
  // { latitude, longitude } -> Promise<NormalizedWeatherSnapshot>
  //
  // Callers are expected to only call this with real coordinates already in
  // hand (Station.latitude/longitude) — this adapter doesn't special-case a
  // missing coordinate pair itself, same "adapters stay dumb, callers decide
  // when to call them" stance as RailRadarAdapter.
  async fetchCurrentConditions({ latitude, longitude }) {
    if (!config.openWeatherMapApiKey) {
      throw new Error(
        "WeatherAdapter: OPENWEATHERMAP_API_KEY is not set — copy .env.example to .env and fill it in."
      );
    }

    // units=metric — doesn't change either field we actually read today:
    // `visibility` is always metres regardless of this param, and
    // `weather[0].main` is a fixed category string, not a measurement. Set
    // anyway so the request doesn't silently fall back to OpenWeatherMap's
    // default (`standard`, i.e. Kelvin) — a footgun for whichever field
    // (temperature, wind speed, ...) M5 reads from this response next,
    // given India's own reporting convention is Celsius, not Kelvin or
    // Fahrenheit. See the M5 reminder in PROJECT.md §10.
    const url = `${CURRENT_WEATHER_URL}?lat=${latitude}&lon=${longitude}&units=metric&appid=${config.openWeatherMapApiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable body>");
      const err = new Error(
        `WeatherAdapter: current-weather request responded ${response.status} ${response.statusText} — ${body}`
      );
      err.upstreamStatus = response.status;
      throw err;
    }

    const rawJson = await response.json();
    return mapCurrentWeather(rawJson);
  }
}

module.exports = { WeatherAdapter };
