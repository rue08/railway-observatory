const { Worker } = require("bullmq");
const connection = require("../connection");
const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");
const { NewsAdapter } = require("../../adapters/newsAdapter");
const { matchNewsEventAgainstVisits } = require("../../normalize/newsMatching");

const newsAdapter = new NewsAdapter();

// Buffer subtracted from the high-water mark below — tolerates slight
// out-of-order arrival near the boundary (two items published seconds
// apart landing in a different order than expected) without risking a
// missed item. Deliberately generous relative to the 1hr matching window
// this feeds into; the unique constraint on sourceUrl is still the real
// correctness backstop regardless of this value, so erring wide here costs
// a few redundant (P2002, silently absorbed) insert attempts, not
// correctness.
const WATERMARK_SAFETY_BUFFER_MS = 10 * 60 * 1000;

// Job payload: {} — the feed isn't per-train the way ingestion's
// { trainNumber } is, so there's nothing to parameterize per tick. Each
// firing fetches the whole feed and figures out for itself which items are
// genuinely new.
const newsWorker = new Worker(
  "news",
  async () => {
    const items = await newsAdapter.fetchLatest();

    // High-water-mark pre-filter — Google's feed returns everything
    // currently matching the query on every poll (there's no "give me only
    // what's new since X" option), and its size isn't bounded by anything
    // we control. Without this, insert-attempt cost scales with total feed
    // size (100 items today, however many tomorrow), not with how much is
    // actually new each tick — normally a handful. This is purely a cost
    // optimization layered on top of the sourceUrl unique constraint, not
    // a replacement for it: an item that slips past this filter and turns
    // out to already exist still gets caught by the P2002 branch below,
    // same as before this existed.
    const latestStored = await prisma.newsEvent.findFirst({
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    });
    const cutoff = latestStored
      ? new Date(latestStored.publishedAt.getTime() - WATERMARK_SAFETY_BUFFER_MS)
      : null; // first-ever poll, nothing stored yet — consider the whole feed
    const candidates = cutoff ? items.filter((item) => item.publishedAt > cutoff) : items;

    let created = 0;
    for (const item of candidates) {
      // create(), not upsert() — a P2002 (unique sourceUrl) means we've
      // already seen and already matched this exact item on a previous
      // poll; deliberately not re-matching it here (see below).
      const newsEvent = await prisma.newsEvent.create({ data: item }).catch((err) => {
        if (err.code === "P2002") return null;
        throw err;
      });

      if (!newsEvent) continue;
      created++;

      // Only genuinely new items run the match. An already-stored item was
      // already checked against whatever delayed visits existed at the
      // time it first landed — re-scanning it every poll would just repeat
      // work the unique constraint on NewsEventMatch would silently absorb
      // anyway. The "old news, new visit arrives later" case is exactly
      // what the *other* direction (normalize/stationVisits.js, triggered
      // when a new delayed StationVisit is written) exists to catch.
      await matchNewsEventAgainstVisits({ prisma, newsEvent, logger });
    }

    logger.info(
      { fetched: items.length, consideredForInsert: candidates.length, created },
      "News poll processed"
    );
  },
  { connection }
);

newsWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "News poll job failed");
});

module.exports = newsWorker;
