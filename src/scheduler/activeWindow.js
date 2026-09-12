// Decides whether *today's* departure of a tracked train has actually
// started yet, so the scheduler doesn't poll for a service date's run
// before it exists — not 24/7 (see docs/tracked-trains.md for why that
// matters: RailRadar's 1,000 req/month free tier can't absorb blind
// polling).
//
// This used to also answer "is there possibly a run from a previous day
// still active" — a backward-searching loop over candidate departure days,
// computing each one's full scheduled arrival window. That's gone as of
// Sept 13 2026 (PROJECT.md §6): it's now answered exactly by querying
// TrainRun rows with status RUNNING/SCHEDULED directly, not by re-deriving
// it from schedule arithmetic every tick. That change was forced by a real
// bug the old version had no way to see — 12307/12308 departs daily but
// takes 29h45m, so consecutive back-to-back-day departures overlap by
// ~5h45m, and RailRadar's /live endpoint reports on whichever instance is
// "current" for a train number with no way to ask for a specific one. The
// old run days a TrainRun query now watches directly used to just go dark
// mid-journey the moment a newer departure took over as "live." See §13.
//
// RailRadar's schedule times (RouteStation.scheduledArrivalTime/
// scheduledDepartureTime) are IST wall-clock minutes-since-midnight (see
// adapters/railRadar/mappers.js). This reconstructs the current IST
// wall-clock time without a timezone library, by doing arithmetic in
// "IST-shifted" millisecond space: shift the current instant by IST's
// fixed +5:30 offset, then read its UTC calendar fields back out — those
// fields are then the real IST wall-clock date/time, regardless of what
// timezone the machine running this code is actually in. India has a
// single fixed offset year-round (no DST), so this stays correct without
// needing to know the server's own timezone at all.

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MINUTE_MS = 60 * 1000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toIstShiftedMs(date) {
  return date.getTime() + IST_OFFSET_MINUTES * MINUTE_MS;
}

// Date -> "YYYY-MM-DD" in IST — exported so callers matching a serviceDate
// against "today" (scheduler.worker.js) use the exact same notion of
// "today" as hasTodaysDepartureStarted does below, rather than each
// re-deriving it slightly differently (e.g. a naive
// `new Date().toISOString().slice(0,10)` would read the *UTC* date, which
// disagrees with the IST one for roughly 5.5 hours a day, right around
// local midnight — precisely the boundary this whole file exists to get
// right).
function todayIstDateString(now = new Date()) {
  const nowIst = new Date(toIstShiftedMs(now));
  const yyyy = nowIst.getUTCFullYear();
  const mm = String(nowIst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowIst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// { train, origin, now? } -> boolean
//
// `origin` is routeStations[0] (the caller's job to pick out, same as
// before) — only origin.scheduledDepartureTime matters here now; the
// terminus/arrival side of the old window is gone along with the loop.
function hasTodaysDepartureStarted({ train, origin, now = new Date() }) {
  if (!train.runDays || train.runDays.length === 0 || origin.scheduledDepartureTime == null) {
    return false;
  }

  const nowShifted = toIstShiftedMs(now);
  const nowIst = new Date(nowShifted);
  const todayWeekday = WEEKDAYS[nowIst.getUTCDay()];

  if (!train.runDays.includes(todayWeekday)) return false;

  const todayMidnightShifted = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate()
  );
  const departureInstant = todayMidnightShifted + origin.scheduledDepartureTime * MINUTE_MS;

  return nowShifted >= departureInstant;
}

module.exports = { hasTodaysDepartureStarted, todayIstDateString };
