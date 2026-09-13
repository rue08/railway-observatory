// Indian Railways zone for each tracked train — PROJECT.md §10.
//
// Manually hardcoded, deliberately NOT a `Train.zone` DB column. A column
// would imply it's populated by the import pipeline like every other
// `Train` field (destinationCode, runDays, ...) — it isn't. Checked against
// a real live call to RailRadar's `GET /v1/trains/{number}` Sept 13 2026
// (an earlier code comment in adapters/railRadar/schemas.js claiming a
// `zone` field exists there turned out to be inaccurate, unverified until
// then): the actual response carries no zone field anywhere. No other
// source was checked and confirmed either (data.gov.in's static set and the
// `datameet/railways` GitHub dataset are unverified candidates).
//
// Only viable at this scale — a couple of hand-verified trains. Revisit
// with a real source before this could ever extend to a larger
// tracked-train list.
const TRAIN_ZONE = {
  "12307": { name: "Eastern Railway", code: "ER" },
  "12308": { name: "Eastern Railway", code: "ER" },
};

// Every other Indian Railways zone's full name. Used only to check whether
// a news title names a zone OTHER than a given train's own — never to
// classify which single zone a title is "about", so there's no ordering
// requirement here despite some names sharing a substring (e.g. "South
// Eastern Railway" contains "Eastern Railway"): each entry is tested
// independently via a plain substring check, and the train's own zone is
// excluded from this list entirely (see isDifferentZoneMentioned), so a
// title naming a genuinely different zone is always caught correctly
// regardless of iteration order.
const OTHER_ZONES = [
  { name: "Central Railway", code: "CR" },
  { name: "East Central Railway", code: "ECR" },
  { name: "East Coast Railway", code: "ECoR" },
  { name: "Eastern Railway", code: "ER" },
  { name: "North Central Railway", code: "NCR" },
  { name: "North Eastern Railway", code: "NER" },
  { name: "North Western Railway", code: "NWR" },
  { name: "Northeast Frontier Railway", code: "NFR" },
  { name: "Northern Railway", code: "NR" },
  { name: "South Central Railway", code: "SCR" },
  { name: "South East Central Railway", code: "SECR" },
  { name: "South Eastern Railway", code: "SER" },
  { name: "South Western Railway", code: "SWR" },
  { name: "Southern Railway", code: "SR" },
  { name: "West Central Railway", code: "WCR" },
  { name: "Western Railway", code: "WR" },
];

// True if `title` names an Indian Railways zone other than `ownZoneName`.
// Used only to reject a weak `stationName` news match as likely
// coincidental (PROJECT.md §10) — never applied to `trainNumber` matches,
// already specific enough on their own.
function isDifferentZoneMentioned(title, ownZoneName) {
  return OTHER_ZONES.some((zone) => zone.name !== ownZoneName && title.includes(zone.name));
}

module.exports = { TRAIN_ZONE, OTHER_ZONES, isDifferentZoneMentioned };
