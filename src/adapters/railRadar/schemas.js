const { z } = require("zod");

// Raw response shapes straight off RailRadar, before anything is normalized.
// Deliberately narrow — only the fields the reference-data import actually
// uses. Everything else a real response carries (isHalt, distanceFromSourceKm,
// speedToNextStationKmph, platform, zone, runningDays, coachPosition,
// liveData, ...) is silently stripped by zod's default parse behavior, not
// validated or kept.
//
// Confirmed against a real call to GET /v1/trains/{number} (the current,
// non-legacy endpoint), Aug 29 2026. Two earlier attempts at this schema
// were both wrong: one came from the docs site's prose, the other from a
// fixture pasted during planning that — it turned out — actually describes
// the shape of a *different* endpoint, GET /v1/legacy/trains/{number}
// (older, flatter, integer times, no coordinates). Don't merge the two.

// legacy-all-trains-kvs: { success, data: [[number, name], ...], meta }
const RawTrainDirectoryResponse = z.object({
  success: z.boolean(),
  data: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
});

// One stop in GET /v1/trains/{number}'s data.route[] array.
//
// Station identity is a nested object here (code/name/lat/lng), not flat
// stationCode/stationName — and it's where Station.latitude/longitude
// actually come from now (see PROJECT.md §13: no separate coordinates
// source was ever needed, it was sitting in this same payload).
//
// arrival/departure are "HH:mm" strings, not integers — converted to
// minutes-since-midnight in the mapper, not here. arrivalDay/departureDay
// are separate fields (confirmed real, despite an earlier "single day
// field" claim made against the wrong fixture). All four are nullish: the
// origin stop has no arrival/arrivalDay, the terminus has no
// departure/departureDay.
const RawRouteStop = z.object({
  sequence: z.number().int().nonnegative(),
  station: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    lat: z.number().nullish(),
    lng: z.number().nullish(),
  }),
  arrival: z.string().nullish(),
  arrivalDay: z.number().int().nullish(),
  departure: z.string().nullish(),
  departureDay: z.number().int().nullish(),
});

// GET /v1/trains/{number}: { success, data: { train: {...}, route: [...], metadata, liveData? } }
const RawTrainDetailsResponse = z.object({
  success: z.boolean(),
  data: z.object({
    train: z.object({
      number: z.string().min(1),
      name: z.string().min(1),
    }),
    route: z.array(RawRouteStop).min(1),
  }),
});

// One stop in GET /v1/trains/{number}/live's data.route[] array — a
// genuinely different, dedicated live-status endpoint, not the embedded
// (and unreliably present) liveData block sometimes seen on the schedule
// endpoint above. Confirmed against a real mid-journey response, Aug 29
// 2026 (train 12181).
//
// `status` (kept as a bare string rather than a strict enum, since more
// values kept turning up) is load-bearing, not decorative. Three confirmed
// so far, Aug 30 2026: "departed", "upcoming", "at-station".
//
// "upcoming" — a stop the train hasn't reached yet — still carries
// actualArrival/actualDeparture/delayArrival/delayDeparture, populated with
// RailRadar's ETA *projection* (the current delay propagated forward),
// using the exact same field names as a real observation on a "departed"
// stop. Confirmed for real: a halt the train was nowhere near yet already
// had a non-null actualArrival/delayArrival.
//
// "at-station" — the train's current halt — has the *same* real-vs-
// projected split, but only on one side. Confirmed against train 12181
// (Aug 30 2026): the stop's actualArrival was real (matched
// currentLocation.delayMinutes exactly), but actualDeparture was identical
// to scheduledDeparture down to the second, while the train was still
// sitting there (isHalt: true) — i.e. still a projection, not an
// observation, even though the train had genuinely arrived. An
// "at-station" row can never be trusted wholesale if it's ever consumed;
// only its arrival side is safe.
//
// The mapper filters on this — only "departed" stops (plus one deliberate
// exception, see below) become NormalizedStationVisit rows — so
// PROJECT.md §14's rule (observed data is never presented as predicted)
// holds for the append-only StationVisit log.
//
// The exception: a route's terminus never departs (no
// scheduledDeparture/departureDay/actualDeparture field exists there at
// all — confirmed via train 12211's completed journey, Aug 30 2026, whose
// terminus stop sat at "at-station" with only a real actualArrival and no
// departure fields whatsoever), so it could never satisfy "departed" the
// way every other stop does. mapLiveStatus special-cases it — the
// terminus's arrival, once "at-station" with a real actualArrival, still
// becomes a StationVisit row, since it's terminal (nothing more will ever
// happen at that stop) rather than transient like every other "at-station"
// halt. Journey completion itself doesn't depend on this — see
// RawLiveStatusResponse.data.status below, confirmed as the direct signal
// instead — this exception exists purely so the destination arrival isn't
// missing from the historical log.
const RawLiveRouteStop = z.object({
  sequence: z.number().int().nonnegative(),
  stationCode: z.string().min(1),
  stationName: z.string().min(1),
  status: z.string(),
  scheduledArrival: z.coerce.date().nullish(),
  scheduledDeparture: z.coerce.date().nullish(),
  actualArrival: z.coerce.date().nullish(),
  actualDeparture: z.coerce.date().nullish(),
  delayArrival: z.number().int().nullish(),
  delayDeparture: z.number().int().nullish(),
});

// GET /v1/trains/{number}/live. `startDate` (not `journeyDate` — a
// different name was seen on an embedded, now-superseded liveData block)
// is what TrainRun.serviceDate should resolve from once that worker exists.
//
// Untested: what this endpoint returns for a train with no live tracking
// available at all (a 404? success:false? an empty route?) — every real
// call made so far happened to hit a train that was actually running.
// _request()'s existing upstreamStatus handling covers an HTTP-level
// failure; an in-body "no live data" shape, if one exists, isn't confirmed.
const RawLiveStatusResponse = z.object({
  success: z.boolean(),
  data: z.object({
    trainNumber: z.string().min(1),
    startDate: z.string().min(1),
    // Top-level journey state — a separate field from route[].status
    // above, easy to conflate since both come off the same response.
    // Confirmed values, Aug 30 2026: "running" (train 12181, mid-journey)
    // and "completed" (train 12211, terminus reached) — this is the direct
    // signal for TrainRun completion, no need to reason about the
    // terminus's per-stop status at all. Others (e.g. a cancelled-train
    // value) unconfirmed — kept as a bare string, same reasoning as
    // route[].status.
    status: z.string().min(1),
    route: z.array(RawLiveRouteStop).min(1),
  }),
});

module.exports = {
  RawTrainDirectoryResponse,
  RawRouteStop,
  RawTrainDetailsResponse,
  RawLiveRouteStop,
  RawLiveStatusResponse,
};
