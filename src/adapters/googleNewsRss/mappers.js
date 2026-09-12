const { XMLParser } = require("fast-xml-parser");
const { NormalizedNewsEvent } = require("../schemas");

// ignoreAttributes: false + attributeNamePrefix — needed for <source
// url="...">Outlet Name</source>, which is otherwise the one element in
// this feed carrying both an attribute and text content. Confirmed against
// a real fetch, Sept 13 2026: fast-xml-parser gives that element back as
// { "#text": "Outlet Name", "@_url": "..." } — see extractSourceOutlet.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// Google's <source> is a plain string when an item somehow has one with no
// attributes, or the {"#text", "@_url"} object shape above when it does
// (the normal case, confirmed live) — handle both rather than assume.
function extractSourceOutlet(source) {
  if (source == null) return null;
  if (typeof source === "string") return source;
  return source["#text"] ?? null;
}

// Raw RSS/XML string -> NormalizedNewsEvent[]. Split out from
// newsAdapter.js, same precedent as railRadar/mappers.js — testable
// against fixture XML with no real HTTP call involved.
function mapFeedToNewsEvents(xml) {
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];

  // A feed with exactly one <item> parses to a single object, not a
  // one-element array — fast-xml-parser infers arity from what's actually
  // present, it doesn't know the schema. Normalize either way.
  const itemList = Array.isArray(items) ? items : [items];

  return itemList.map((item) =>
    NormalizedNewsEvent.parse({
      sourceUrl: item.link,
      title: item.title,
      sourceOutlet: extractSourceOutlet(item.source),
      publishedAt: item.pubDate,
    })
  );
}

module.exports = { mapFeedToNewsEvents };
