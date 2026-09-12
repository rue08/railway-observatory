const { z } = require("zod");

// The shape NewsAdapter hands back per RSS <item> — see PROJECT.md §4/§9.
// `.parse()` this before it touches Postgres, same "validate at every
// adapter boundary" stance as NormalizedStationVisit (§8).
const NormalizedNewsEvent = z.object({
  sourceUrl: z.string().min(1),
  title: z.string().min(1),
  // Nullish, not required — a feed item without a <source> tag shouldn't
  // fail the whole batch over one missing, non-essential field.
  sourceOutlet: z.string().nullish(),
  publishedAt: z.coerce.date(),
});

module.exports = { NormalizedNewsEvent };
