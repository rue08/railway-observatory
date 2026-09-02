const { Queue } = require("bullmq");
const connection = require("../connection");

// Normalizes raw adapter output, computes delay, writes StationVisit rows,
// and runs the rule-based correlation logic for primaryReasonTag
// (PROJECT.md §6). No producer wired up yet — lands in M2.
const normalizeAndCorrelateQueue = new Queue("normalize-and-correlate", {
  connection,
});

module.exports = normalizeAndCorrelateQueue;
