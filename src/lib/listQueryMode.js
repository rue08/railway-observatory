// Shared from/to/whole query-param validation for the M4/M5 append-only
// list endpoints (NewsEvent, NewsEventMatch, DelayAttribution,
// DelayAttributionReason) — decided in discussion on 2026-09-14: these
// tables are unbounded logs, unlike Station/Train, so their list endpoints
// need a bounded default. The three modes are mutually exclusive by
// design: from/to must appear together, whole excludes both. Only the
// validation is shared — each route builds its own Prisma where/orderBy
// from the resolved mode, since the date field (or join, for
// DelayAttributionReason) differs per table.
function resolveListMode(query) {
  const { from, to, whole } = query;

  if (whole !== undefined) {
    if (whole !== "true") {
      return { error: "whole must be 'true' if provided" };
    }
    if (from !== undefined || to !== undefined) {
      return { error: "whole cannot be combined with from/to" };
    }
    return { mode: "whole" };
  }

  if (from !== undefined || to !== undefined) {
    if (from === undefined || to === undefined) {
      return { error: "from and to must both be provided" };
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return { error: "from/to must be valid dates" };
    }
    return { mode: "range", from: fromDate, to: toDate };
  }

  return { mode: "default" };
}

const DEFAULT_LIST_LIMIT = 100;

module.exports = { resolveListMode, DEFAULT_LIST_LIMIT };
