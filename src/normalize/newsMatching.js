// The "geo/temporal correlation" half of M4 (PROJECT.md §4) — deliberately
// just enough to produce a NewsEventMatch link, nothing scored. Turning a
// match into points/evidence for primaryReasonTag is M5's job (§10/§13).
//
// Called from two trigger points — news.worker.js after upserting a new
// NewsEvent, and normalize/stationVisits.js after writing a new delayed
// StationVisit — so a genuinely new row on either side gets checked against
// the other, whichever direction happens to land second. The two entry
// points below necessarily run different candidate queries (one starts
// from NewsEvent, the other from StationVisit), but both funnel into the
// same match predicate (matchedOnFor) and the same row-creation helper
// (recordMatch) — that's the "one matcher, two trigger points" split.

const { TRAIN_ZONE, isDifferentZoneMentioned } = require("../constants/trainZones");

// ±1 hour — §4's "unconfirmed exact number, a judgment call" figure.
const MATCH_WINDOW_MS = 60 * 60 * 1000;

// Indian Railways train numbers are 5 digits. \b on both sides avoids
// matching inside a longer run of digits (a year, a phone number
// fragment, a distance-in-km figure, etc.).
function extractTrainNumbers(title) {
  return [...title.matchAll(/\b(\d{5})\b/g)].map((m) => m[1]);
}

// The one shared rule both directions apply — §4's "matching by
// train-number-in-title first, station-name-in-title as fallback."
// -> "trainNumber" | "stationName" | null
function matchedOnFor(newsTitle, trainNumber, stationName) {
  if (extractTrainNumbers(newsTitle).includes(trainNumber)) return "trainNumber";

  if (stationName && newsTitle.includes(stationName)) {
    // Zone negative filter, added Sept 14 2026 (PROJECT.md §10) —
    // stationName is the weaker of the two match types (a station name
    // like "Howrah" can appear in unrelated general news); if the title
    // explicitly names a different Indian Railways zone than this train's
    // own, treat it as likely coincidental rather than a real match. Fails
    // open (no filtering applied) for any train without a known zone in
    // TRAIN_ZONE — see constants/trainZones.js for why that's a small,
    // hardcoded set rather than sourced data.
    const ownZone = TRAIN_ZONE[trainNumber];
    if (ownZone && isDifferentZoneMentioned(newsTitle, ownZone.name)) return null;
    return "stationName";
  }

  return null;
}

// Shared by both directions. Silently no-ops on a unique-constraint hit —
// that means the other trigger point already created this exact link (a
// race between the two directions, not a real error) — anything else
// really is one and still throws.
async function recordMatch({ prisma, newsEventId, stationVisitId, matchedOn, logger }) {
  await prisma.newsEventMatch
    .create({ data: { newsEventId, stationVisitId, matchedOn } })
    .then(() => {
      logger?.info({ newsEventId, stationVisitId, matchedOn }, "newsMatching: match recorded");
    })
    .catch((err) => {
      if (err.code !== "P2002") throw err;
    });
}

// Entry point 1 — a new NewsEvent scanning recent delayed StationVisits.
// Only ever matches against trains we actually track and have delay data
// for (§1's tracked-list scope) — this is "does this item explain a delay
// we already observed," not a general search across all of India's trains.
async function matchNewsEventAgainstVisits({ prisma, newsEvent, logger }) {
  const windowStart = new Date(newsEvent.publishedAt.getTime() - MATCH_WINDOW_MS);
  const windowEnd = new Date(newsEvent.publishedAt.getTime() + MATCH_WINDOW_MS);

  const candidateVisits = await prisma.stationVisit.findMany({
    where: {
      AND: [
        { OR: [{ arrivalDelayMinutes: { gt: 0 } }, { departureDelayMinutes: { gt: 0 } }] },
        {
          OR: [
            { actualArrivalAt: { gte: windowStart, lte: windowEnd } },
            { actualDepartureAt: { gte: windowStart, lte: windowEnd } },
          ],
        },
      ],
    },
    include: { station: true, trainRun: { include: { train: true } } },
  });

  for (const visit of candidateVisits) {
    const matchedOn = matchedOnFor(newsEvent.title, visit.trainRun.train.number, visit.station.name);
    if (!matchedOn) continue;

    await recordMatch({
      prisma,
      newsEventId: newsEvent.id,
      stationVisitId: visit.id,
      matchedOn,
      logger,
    });
  }
}

// Entry point 2 — a new delayed StationVisit scanning recent NewsEvents.
// Mirrors entry point 1 in reverse. trainNumber/stationName are passed in
// rather than re-derived from `visit`, since the caller (stationVisits.js)
// already has both in scope from its own reference-data lookups — no
// reason to re-query for data the caller is already holding.
async function matchVisitAgainstNewsEvents({ prisma, visit, trainNumber, stationName, logger }) {
  const hasDelay = (visit.arrivalDelayMinutes ?? 0) > 0 || (visit.departureDelayMinutes ?? 0) > 0;
  if (!hasDelay) return; // delay-gated, per §4 — nothing to explain otherwise

  const anchor = visit.actualArrivalAt ?? visit.actualDepartureAt;
  if (!anchor) return;

  const windowStart = new Date(anchor.getTime() - MATCH_WINDOW_MS);
  const windowEnd = new Date(anchor.getTime() + MATCH_WINDOW_MS);

  const candidateNews = await prisma.newsEvent.findMany({
    where: { publishedAt: { gte: windowStart, lte: windowEnd } },
  });

  for (const newsEvent of candidateNews) {
    const matchedOn = matchedOnFor(newsEvent.title, trainNumber, stationName);
    if (!matchedOn) continue;

    await recordMatch({
      prisma,
      newsEventId: newsEvent.id,
      stationVisitId: visit.id,
      matchedOn,
      logger,
    });
  }
}

module.exports = {
  MATCH_WINDOW_MS,
  extractTrainNumbers,
  matchedOnFor,
  matchNewsEventAgainstVisits,
  matchVisitAgainstNewsEvents,
};
