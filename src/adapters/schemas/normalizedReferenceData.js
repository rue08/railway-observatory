const { z } = require("zod");

// Normalized target shapes for reference-data import (Train/Station/
// RouteStation) — same convention as NormalizedStationVisit (see
// normalizedStationVisit.js, PROJECT.md §5/§8): provider-agnostic, an
// adapter's raw JSON is mapped and .parse()'d into these before anything
// touches Prisma.

const NormalizedTrain = z.object({
  number: z.string().min(1),
  name: z.string().min(1),
  // Lowercase weekday abbreviations — see schema.prisma's Train.runDays
  // comment for why this exists and who consumes it.
  runDays: z.array(z.string()).default([]),
});

// latitude/longitude nullish — not every source provides them (see
// PROJECT.md §13), but RailRadar's GET /v1/trains/{number} route data does,
// so this is populated whenever that's the source.
const NormalizedStation = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
});

// One row per (train, stop). arrivalDayOffset/departureDayOffset are
// separate fields, not one combined dayOffset — confirmed against a real
// RailRadar response (Aug 29 2026) that they can, in principle, differ
// (a halt spanning midnight). scheduledArrivalTime/scheduledDepartureTime
// are Int minutes-since-midnight — converted from RailRadar's native
// "HH:mm" strings in the mapper, not its native format itself, but kept as
// Int here to match RouteStation's Int columns and keep delay-minute
// arithmetic simple. All four are nullish, not just nullable: a provider
// may omit the field entirely (origin/terminus stops) rather than send an
// explicit null.
const NormalizedRouteStation = z.object({
  trainNumber: z.string().min(1),
  stationCode: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative(),
  arrivalDayOffset: z.number().int().nullish(),
  departureDayOffset: z.number().int().nullish(),
  scheduledArrivalTime: z.number().int().nonnegative().nullish(),
  scheduledDepartureTime: z.number().int().nonnegative().nullish(),
});

module.exports = { NormalizedTrain, NormalizedStation, NormalizedRouteStation };
