const config = require("../config/env");
const { mapTrainDirectory, mapTrainSchedule, mapLiveStatus } = require("./railRadar/mappers");

// Real RailRadar adapter — fulfills the shared adapter contract from
// PROJECT.md §5. Base URL and auth scheme confirmed against a real call,
// Aug 29 2026 (Authorization: Bearer, base https://api.railradar.in).
//
// trainSchedule hits GET /v1/trains/{number} — the *current* endpoint, not
// GET /v1/legacy/trains/{number}. Both exist and both work, but they return
// genuinely different shapes (see ./railRadar/schemas.js): the legacy one
// is flatter with integer times and no coordinates, the current one nests
// station identity and includes real lat/lng per stop. We deliberately use
// the current one for the coordinates.
const ENDPOINTS = {
  trainDirectory: "/v1/legacy/trains/all-kvs",
  trainSchedule: (trainNumber) => `/v1/trains/${trainNumber}`,
  // A dedicated, separate endpoint from trainSchedule above — not the
  // liveData block sometimes embedded in that one's response (present for
  // some trains, absent for others, unreliable — see PROJECT.md §5/§6).
  liveStatus: (trainNumber) => `/v1/trains/${trainNumber}/live`,
};

class RailRadarAdapter {
  async fetchTrainDirectory() {
    const rawJson = await this._request(ENDPOINTS.trainDirectory);
    return mapTrainDirectory(rawJson);
  }

  async fetchTrainSchedule(trainNumber) {
    const rawJson = await this._request(ENDPOINTS.trainSchedule(trainNumber));
    return mapTrainSchedule(rawJson);
  }

  // -> Promise<{ journeyStatus, serviceDate, sourceProvider, stationVisits }>
  // — updated shape, Aug 30 2026 (was a bare NormalizedStationVisit[]; see
  // mapLiveStatus's comment for why). stationVisits holds only
  // actually-departed stops.
  async fetchLiveStatus(trainNumber) {
    const rawJson = await this._request(ENDPOINTS.liveStatus(trainNumber));
    return mapLiveStatus(rawJson);
  }

  async _request(path) {
    if (!config.railradarApiKey) {
      throw new Error(
        "RailRadarAdapter: RAILRADAR_API_KEY is not set — copy .env.example to .env and fill it in."
      );
    }

    const url = `${config.railradarBaseUrl}${path}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.railradarApiKey}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable body>");
      const err = new Error(
        `RailRadarAdapter: ${path} responded ${response.status} ${response.statusText} — ${body}`
      );
      // Attached so callers (e.g. the trains route) can map an upstream 404
      // (invalid train number) to their own 404, vs. a genuine upstream
      // failure — without every caller re-parsing the message string.
      err.upstreamStatus = response.status;
      throw err;
    }

    return response.json();
  }
}

module.exports = { RailRadarAdapter };
