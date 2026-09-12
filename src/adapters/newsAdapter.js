const { mapFeedToNewsEvents } = require("./googleNewsRss/mappers");

// The broad query finalized Sept 11 2026 (PROJECT.md §4) — deliberately not
// scoped to 12307/12308 specifically, since a narrower per-train query was
// tried first and returned zero results; incident coverage exists in
// aggregate across the network, not reliably per-train. hl/gl/ceid pin the
// feed to English-language, India-region results, matching what was
// actually verified against real data (Sept 11-13 2026).
const BASE_QUERY = "%22Indian+Railways%22+(delay+OR+disruption+OR+derailment+OR+cancelled)";

// Not a fixed constant like BASE_QUERY — recomputed every call, since
// "yesterday" changes daily and the whole point is to track the current
// date, not freeze it at process start.
//
// after:<date> is Google Search's own date-range operator, confirmed
// working when embedded in `q=` against this exact feed (Sept 13 2026 —
// 100 items with no date bound, 3 with after:<that day>; see PROJECT.md
// §4). Not a documented, dedicated RSS parameter — none exists (a
// fabricated since= param was tried and silently ignored). Deliberately
// loose (yesterday, not today) rather than precise: the operator is
// day-granularity only and its timezone boundary is undocumented, so this
// is purely a generous bandwidth/parse-cost bound, not the correctness
// mechanism — news.worker.js's own millisecond-precise high-water-mark
// filter is what actually decides what's new.
function buildFeedUrl() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `https://news.google.com/rss/search?q=${BASE_QUERY}+after:${dateStr}&hl=en-IN&gl=IN&ceid=IN:en`;
}

// Fulfils the news half of the shared adapter contract from PROJECT.md §5.
// No auth, no API key — this is an unofficial, undocumented Google
// interface (§4's own caveat: it could change shape without notice, a
// normal risk for an unofficial feed), not a published API with a
// contractual shape to code defensively against beyond the normal
// "validate whatever comes back" stance already applied everywhere else
// (§8, via NormalizedNewsEvent).
class NewsAdapter {
  async fetchLatest() {
    const response = await fetch(buildFeedUrl());

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable body>");
      const err = new Error(
        `NewsAdapter: feed request responded ${response.status} ${response.statusText} — ${body}`
      );
      err.upstreamStatus = response.status;
      throw err;
    }

    const xml = await response.text();
    return mapFeedToNewsEvents(xml);
  }
}

module.exports = { NewsAdapter };
