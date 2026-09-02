const { z } = require("zod");

// The shared contract every railway adapter must return from
// fetchLiveStatus() — see PROJECT.md §5. One entry per station in the
// train's route for that run. `.parse()` this against whatever an adapter
// (RailRadar, IndianRailAPI, ...) hands back before it touches Postgres —
// PROJECT.md §8's decided mitigation for dropping TypeScript: this is what
// actually catches a provider silently renaming/dropping a field or
// returning null where a date was expected.
//
// Deliberately excludes fields the railway adapter doesn't own:
// - visibilityMeters — comes from a separate WeatherAdapter, merged in later
//   by the normalize-and-correlate worker (§6), not part of this shape.
// - primaryReasonTag — set by the correlation engine (§10), never by a
//   railway adapter directly.
// - our internal Station/TrainRun ids — adapters only know station codes
//   and train numbers; resolving those to our cuids happens after parsing.
const NormalizedStationVisit = z.object({
  trainNumber: z.string().min(1),
  serviceDate: z.coerce.date(),

  stationCode: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative(),

  // Nullish (null OR undefined both accepted), not just nullable — a
  // provider may omit the field entirely rather than send an explicit
  // null, and both cases are legitimate at the origin/terminus station
  // (RouteStation's own scheduled times are nullable for the same reason).
  scheduledArrivalAt: z.coerce.date().nullish(),
  scheduledDepartureAt: z.coerce.date().nullish(),
  actualArrivalAt: z.coerce.date().nullish(),
  actualDepartureAt: z.coerce.date().nullish(),

  // int(), not a bare number() — §8's explicit callout: a bare z.number()
  // lets NaN through silently, since typeof NaN === "number".
  arrivalDelayMinutes: z.number().int().nullish(),
  departureDelayMinutes: z.number().int().nullish(),

  sourceProvider: z.string().min(1),
});

module.exports = { NormalizedStationVisit };
