// Deterministic keyword tagging over a matched NewsEvent's title —
// PROJECT.md §10. Not ML, no confidence score: plain regex, same spirit as
// newsMatching.js's own 5-digit train-number extraction. Real constraint
// this works within: the RSS feed carries no body/description (§9), only a
// headline — category detection can only ever see what the headline itself
// says, nothing more.
//
// Order doesn't matter for detection (every category is tested
// independently, and a title can genuinely belong to more than one — see
// normalize/delayAttribution.js's tie-break priority for how that's
// resolved when it comes to picking a single primaryReasonTag).
const CATEGORY_KEYWORDS = {
  // Folded into the structured `weather` reason line in delayAttribution.js
  // rather than getting its own — a title-detected "weather" category is
  // corroboration for that line, never a second independent score.
  weather: /\b(fog|rain|flood(?:ing)?|visibility|monsoon|storm)\b/i,
  maintenance: /\b(maintenance|engineering work|track work|block(?:ade)?ed?|repair)\b/i,
  // NOT bare "traffic" — "rail traffic" is generic railway-news phrasing
  // ("disrupts eastern rail traffic" just means "train services", not
  // literal congestion) that would false-positive on nearly every article
  // the base feed query returns. Caught by a sanity check Sept 14 2026,
  // not a hypothetical — a real title fired on it during testing.
  congestion: /\b(congestion|signal failure|bottleneck|overcrowd|gridlock)\b/i,
  accident: /\b(derail(?:ment|ed)?|collision|accident|crash)\b/i,
  disruption: /\b(protest|blockade|agitation|strike|rail roko|sabotage)\b/i,
};

// title -> string[] (category names present, each tested independently —
// a single title can carry more than one).
function detectCategories(title) {
  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, pattern]) => pattern.test(title))
    .map(([category]) => category);
}

module.exports = { CATEGORY_KEYWORDS, detectCategories };
