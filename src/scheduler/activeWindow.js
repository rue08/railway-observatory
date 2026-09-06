// Decides whether a tracked train has a run in progress right now, so the
// scheduler only enqueues ingestion polls while a train is actually
// running — not 24/7 (see docs/tracked-trains.md for why this matters:
// RailRadar's 1,000 req/month free tier can't absorb blind polling).
//
// RailRadar's schedule times (RouteStation.scheduledArrivalTime/
// scheduledDepartureTime) are IST wall-clock minutes-since-midnight, with
// arrivalDayOffset/departureDayOffset counting relative days from
// departure (see adapters/railRadar/mappers.js). This reconstructs the
// same wall-clock window without a timezone library, by doing all
// arithmetic in "IST-shifted" millisecond space: shift the current instant
// by IST's fixed +5:30 offset, then read its UTC calendar fields back out
// — those fields are then the real IST wall-clock date/time, regardless of
// what timezone the machine running this code is actually in. India has a
// single fixed offset year-round (no DST), so this stays correct without
// needing to know the server's own timezone at all.

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toIstShiftedMs(date) {
  return date.getTime() + IST_OFFSET_MINUTES * MINUTE_MS;
}

// { train, routeStations, now? } -> boolean
//
// `routeStations` must be ordered by sequenceNumber ascending (the caller's
// job — this only looks at the first and last entries, per PROJECT.md §9's
// "current status" reasoning: only origin-departure and terminus-arrival
// define the window, intermediate stops don't matter for "is it running").
function isTrainActiveNow({ train, routeStations, now = new Date() }) {
  if (!train.runDays || train.runDays.length === 0 || routeStations.length === 0) {
    return false;
  }

  const origin = routeStations[0];
  const terminus = routeStations[routeStations.length - 1];

  if (
    origin.scheduledDepartureTime == null ||
    origin.departureDayOffset == null ||
    terminus.scheduledArrivalTime == null ||
    terminus.arrivalDayOffset == null
  ) {
    // Incomplete reference data (shouldn't happen post-import, but this is
    // a "should we spend an API call" gate — fail closed, not open).
    return false;
  }

  // How many calendar days the journey spans, e.g. 2 for 12307/12308
  // (departureDayOffset 1 -> arrivalDayOffset 3), 0 for a same-day round
  // trip leg (both offsets 1).
  const spanDays = terminus.arrivalDayOffset - origin.departureDayOffset;

  const nowShifted = toIstShiftedMs(now);
  const nowIst = new Date(nowShifted);
  const todayMidnightShifted = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate()
  );

  // Any run still in progress right now must have departed within the last
  // `spanDays` days (a +1 safety margin covers the exact-boundary case).
  // For 12307/12308 (spanDays=2) this checks today, yesterday, and the day
  // before — not an unbounded scan.
  for (let daysAgo = 0; daysAgo <= spanDays + 1; daysAgo++) {
    const candidateMidnight = todayMidnightShifted - daysAgo * DAY_MS;
    const candidateWeekday = WEEKDAYS[new Date(candidateMidnight).getUTCDay()];
    if (!train.runDays.includes(candidateWeekday)) continue;

    const windowStart = candidateMidnight + origin.scheduledDepartureTime * MINUTE_MS;
    const windowEnd = candidateMidnight + spanDays * DAY_MS + terminus.scheduledArrivalTime * MINUTE_MS;

    if (nowShifted >= windowStart && nowShifted <= windowEnd) {
      return true;
    }
  }

  return false;
}

module.exports = { isTrainActiveNow };
