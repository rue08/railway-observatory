const {
  RawTrainDirectoryResponse,
  RawTrainDetailsResponse,
  RawLiveStatusResponse,
} = require("./schemas");
const {
  NormalizedTrain,
  NormalizedStation,
  NormalizedRouteStation,
} = require("../schemas/normalizedReferenceData");
const { NormalizedStationVisit } = require("../schemas/normalizedStationVisit");

// Pure raw -> normalized mapping used by RailRadarAdapter. Kept separate
// from the HTTP call itself so the mapping/validation logic stays testable
// against a raw JSON literal with no network involved.

// "11:50" -> 710, "00:08" -> 8. RailRadar's route times are "HH:mm" strings;
// converted to minutes-since-midnight here to match RouteStation's Int
// columns (PROJECT.md §9) and keep delay-minute arithmetic simple later.
function parseHhMmToMinutes(hhmm) {
  if (hhmm == null) return null;
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function mapTrainDirectory(rawJson) {
  const raw = RawTrainDirectoryResponse.parse(rawJson);
  return raw.data.map(([number, name]) => NormalizedTrain.parse({ number, name }));
}

function mapTrainSchedule(rawJson) {
  const raw = RawTrainDetailsResponse.parse(rawJson);

  const train = NormalizedTrain.parse({
    number: raw.data.train.number,
    name: raw.data.train.name,
    runDays: raw.data.train.runDays,
    destinationCode: raw.data.train.destination.code,
  });

  // Dedupe stations by code — a station shouldn't appear twice with a
  // different name/coordinates within one train's route, but guard against
  // a provider quirk anyway by keeping the first entry seen for a given code.
  const stationsByCode = new Map();
  for (const stop of raw.data.route) {
    if (!stationsByCode.has(stop.station.code)) {
      stationsByCode.set(
        stop.station.code,
        NormalizedStation.parse({
          code: stop.station.code,
          name: stop.station.name,
          latitude: stop.station.lat,
          longitude: stop.station.lng,
        })
      );
    }
  }

  const routeStations = raw.data.route.map((stop) =>
    NormalizedRouteStation.parse({
      trainNumber: train.number,
      stationCode: stop.station.code,
      sequenceNumber: stop.sequence,
      arrivalDayOffset: stop.arrivalDay,
      departureDayOffset: stop.departureDay,
      scheduledArrivalTime: parseHhMmToMinutes(stop.arrival),
      scheduledDepartureTime: parseHhMmToMinutes(stop.departure),
    })
  );

  return { train, stations: [...stationsByCode.values()], routeStations };
}

// Return shape: { journeyStatus, serviceDate, sourceProvider, stationVisits }
// — not a bare NormalizedStationVisit[] (a real change to the adapter
// contract from PROJECT.md §5, Aug 30 2026: journeyStatus is what drives
// TrainRun's RUNNING/COMPLETED transitions, see normalize/stationVisits.js).
// serviceDate and sourceProvider are surfaced at this top level, not just
// per-visit, because stationVisits can legitimately be empty — a
// journeyStatus of "completed" often arrives on a poll with zero new
// visits (every stop was already "departed" on an earlier poll; the
// terminus itself never reaches "departed" at all, see schemas.js) — and
// there'd be nothing to read serviceDate/sourceProvider off of otherwise.
//
// Only "departed" stops become NormalizedStationVisit rows, plus one
// deliberate exception — "upcoming" and "at-station" stops otherwise carry
// RailRadar's ETA *projections* in some or all of the same actual*/delay*
// fields a real observation would use (confirmed against real responses,
// Aug 30 2026; see schemas.js's RawLiveRouteStop comment for the full
// breakdown, including the at-station arrival/departure asymmetry).
// Silently dropping them here, not just at the DB-write stage, keeps the
// contract simple: every visit in stationVisits is a real observation,
// full stop — no caller has to re-derive that distinction downstream.
//
// The exception: the route's terminus. It structurally never departs (no
// scheduledDeparture/actualDeparture field exists there at all — confirmed
// via train 12211's completed journey), so it can never satisfy the
// "departed" check and, without this exception, its arrival — a genuine,
// final, observed event — would never become a StationVisit row at all.
// Once the terminus is "at-station" it has genuinely arrived: at-station
// *arrival* is real (unlike at-station departure elsewhere in the route,
// which is a projection — this asymmetry is exactly why every OTHER
// "at-station" stop stays excluded; only the terminus is safe, and only
// because it's terminal, not transient — nothing more will happen there).
function mapLiveStatus(rawJson) {
  const raw = RawLiveStatusResponse.parse(rawJson);

  // Sequence-number-based, not positional (route[route.length - 1]) —
  // functionally identical given every response seen so far is already in
  // sequence order, but doesn't silently assume that ordering. This
  // project has been burned twice (PROJECT.md §4) by an unverified shape
  // assumption turning out wrong later.
  const terminusStop = raw.data.route.reduce((max, s) => (s.sequence > max.sequence ? s : max));

  const stationVisits = raw.data.route
    .filter(
      (stop) =>
        stop.status === "departed" ||
        (stop === terminusStop && stop.status === "at-station" && stop.actualArrival != null)
    )
    .map((stop) =>
      NormalizedStationVisit.parse({
        trainNumber: raw.data.trainNumber,
        serviceDate: raw.data.startDate,
        stationCode: stop.stationCode,
        sequenceNumber: stop.sequence,
        scheduledArrivalAt: stop.scheduledArrival,
        scheduledDepartureAt: stop.scheduledDeparture,
        actualArrivalAt: stop.actualArrival,
        actualDepartureAt: stop.actualDeparture,
        arrivalDelayMinutes: stop.delayArrival,
        departureDelayMinutes: stop.delayDeparture,
        sourceProvider: "railradar",
      })
    );

  return {
    journeyStatus: raw.data.status,
    serviceDate: raw.data.startDate,
    sourceProvider: "railradar",
    stationVisits,
  };
}

module.exports = { mapTrainDirectory, mapTrainSchedule, mapLiveStatus };
