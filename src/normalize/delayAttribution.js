// The scored correlation engine — PROJECT.md §10, design fully settled
// Sept 13 2026. Pure functions only: given a StationVisit (with its
// station, weatherCondition, and newsMatches->newsEvent already loaded),
// compute the reason lines, total score, primaryReasonTag, and
// confidenceTier. No Prisma writes here — that's
// jobs/workers/delayAttribution.worker.js's job, same split as
// normalize/stationVisits.js keeping persistence out of its own normalize
// logic.

const { detectCategories } = require("./newsCategories");

const WEATHER_SCORE = 2;
const CATEGORY_SCORE = 1;
const NEWS_CORROBORATION_SCORE = { trainNumber: 2, stationName: 1 };

// Tie-break order for primaryReasonTag among genuine cause lines —
// researched against real Indian Railways data Sept 13 2026 (PROJECT.md
// §10): congestion/signal failures are named repeatedly as the leading
// cause category, CAG audits quantify maintenance/asset-failure-linked
// punctuality loss at ~22.2% (2018) and sabotage/obstruction-driven delay
// at ~11%, while accident/derailment has no comparable standalone
// punctuality-loss figure (audited separately, as safety incidents).
// `weather` is first not because of this research but because its score
// (2) is structurally higher than any single news-derived category's (1) —
// it wins on score alone whenever present, this ordering just makes that
// explicit rather than relying on the scores never being rebalanced.
const CAUSE_PRIORITY = ["weather", "congestion", "maintenance", "disruption", "accident"];

// A qualifying weatherCondition value. Widened slightly past the rubric's
// literal "rain/fog" wording to OpenWeatherMap's actual category
// vocabulary — Drizzle/Thunderstorm as rain-adjacent, Mist as fog-adjacent.
const WEATHER_TRIGGER_PATTERN = /rain|fog|drizzle|thunderstorm|mist/i;

// Simplification worth flagging: the original rubric wording was "+2 if
// rain/fog started within 30 min before the delay increased," implying an
// independent "when did the weather start" timestamp. There isn't one —
// WeatherAdapter fetches current conditions at the same moment the
// StationVisit row itself is written (normalize/stationVisits.js), so
// there's no separate window to check against. This checks the simpler,
// actually-available fact instead: was a qualifying condition present when
// this delay was observed.
function weatherReason(visit) {
  if (!visit.weatherCondition || !WEATHER_TRIGGER_PATTERN.test(visit.weatherCondition)) return null;

  const visibility = visit.visibilityMeters != null ? `, visibility ${visit.visibilityMeters}m` : "";
  return {
    reason: "weather",
    score: WEATHER_SCORE,
    source: "weather-snapshot",
    matchType: null,
    detail: `${visit.weatherCondition} reported at ${visit.station.name}${visibility}`,
  };
}

function newsDetail(match) {
  const outlet = match.newsEvent.sourceOutlet ?? "unknown outlet";
  return `"${match.newsEvent.title}" — ${outlet}, ${match.newsEvent.publishedAt.toISOString()}`;
}

// Category lines, deduplicated per category across every matched article on
// this visit — not per article, so three outlets naming the same cause
// still counts once, not three times (PROJECT.md §10). Also tracks the
// single best matchedOn across all matches (trainNumber beats stationName),
// for the news-corroboration line below.
function newsCategoryReasons(visit) {
  const categoryToMatch = new Map(); // category -> first supporting match
  let bestMatch = null;

  for (const match of visit.newsMatches) {
    if (!bestMatch || (bestMatch.matchedOn === "stationName" && match.matchedOn === "trainNumber")) {
      bestMatch = match;
    }

    // "weather" detected in news text never gets its own line here — it
    // folds into the structured weatherReason() above as corroboration,
    // never double-counted as a second independent score.
    const categories = detectCategories(match.newsEvent.title).filter((c) => c !== "weather");
    for (const category of categories) {
      if (!categoryToMatch.has(category)) categoryToMatch.set(category, match);
    }
  }

  const reasons = [...categoryToMatch.entries()].map(([category, match]) => ({
    reason: category,
    score: CATEGORY_SCORE,
    source: "news",
    matchType: match.matchedOn,
    detail: newsDetail(match),
  }));

  return { reasons, bestMatch };
}

// Contributes nothing on its own — only appended once at least one genuine
// cause line already exists (weatherReason or a newsCategoryReasons entry).
// A news item just confirming "this train was delayed," naming no cause,
// isn't evidence of *why* it happened, only that it did.
function newsCorroborationReason(bestMatch, hasGenuineCause) {
  if (!hasGenuineCause || !bestMatch) return null;

  return {
    reason: "news-corroboration",
    score: NEWS_CORROBORATION_SCORE[bestMatch.matchedOn],
    source: "news",
    matchType: bestMatch.matchedOn,
    detail: newsDetail(bestMatch),
  };
}

function computeReasons(visit) {
  const reasons = [];

  const weather = weatherReason(visit);
  if (weather) reasons.push(weather);

  const { reasons: categoryReasons, bestMatch } = newsCategoryReasons(visit);
  reasons.push(...categoryReasons);

  const corroboration = newsCorroborationReason(bestMatch, reasons.length > 0);
  if (corroboration) reasons.push(corroboration);

  return reasons;
}

// Only ever a genuine cause — never "news-corroboration", which is
// evidence a delay was reported, not a cause of it (PROJECT.md §10). Ties
// broken by CAUSE_PRIORITY; weather wins in practice via score alone (see
// that constant's comment).
function primaryReasonTagFor(reasons) {
  const causeLines = reasons.filter((r) => r.reason !== "news-corroboration");
  if (causeLines.length === 0) return null;

  return causeLines.reduce((best, line) => {
    if (line.score !== best.score) return line.score > best.score ? line : best;
    return CAUSE_PRIORITY.indexOf(line.reason) < CAUSE_PRIORITY.indexOf(best.reason) ? line : best;
  }).reason;
}

// Forced to LOW whenever primaryReasonTag is null — "confidence in the
// reason" means nothing when there is no reason, regardless of how many
// news-corroboration points a visit racked up on its own (PROJECT.md §10).
// Cutoffs: Low 0-1 / Medium 2-4 / High 5+. Flagged in PROJECT.md §10 as
// reasoned-through, not yet observed against real traffic — revisit if the
// rare 7-8 edge case turns out to fire constantly rather than stay rare.
function tierFor(totalScore, primaryReasonTag) {
  if (!primaryReasonTag) return "LOW";
  if (totalScore >= 5) return "HIGH";
  if (totalScore >= 2) return "MEDIUM";
  return "LOW";
}

// visit needs: weatherCondition, visibilityMeters, station.name,
// newsMatches[].matchedOn + newsMatches[].newsEvent.{title,sourceOutlet,publishedAt}
function computeAttribution(visit) {
  const reasons = computeReasons(visit);
  const totalScore = reasons.reduce((sum, r) => sum + r.score, 0);
  const primaryReasonTag = primaryReasonTagFor(reasons);
  const confidenceTier = tierFor(totalScore, primaryReasonTag);

  return { reasons, totalScore, primaryReasonTag, confidenceTier };
}

function reasonIdentity(r) {
  return `${r.reason}:${r.score}:${r.source}:${r.matchType ?? ""}`;
}

// Same "compute fresh, compare against latest, write only if different"
// shape as normalize/stationVisits.js's isUnchanged() — see PROJECT.md §10
// for the worked example. Compares identity (reason/score/source/matchType),
// not the free-text `detail`, so a slightly reworded evidence line for an
// unchanged underlying fact doesn't itself trigger a new row.
function isAttributionUnchanged(latestReasons, freshReasons) {
  if (!latestReasons) return false;
  if (latestReasons.length !== freshReasons.length) return false;

  const a = latestReasons.map(reasonIdentity).sort();
  const b = freshReasons.map(reasonIdentity).sort();
  return a.every((value, i) => value === b[i]);
}

module.exports = {
  computeAttribution,
  isAttributionUnchanged,
  CAUSE_PRIORITY,
};
