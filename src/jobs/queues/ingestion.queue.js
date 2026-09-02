const { Queue } = require("bullmq");
const connection = require("../connection");

// Pulls from railway/weather adapters on a schedule (PROJECT.md §6). The
// ingestion worker consuming this queue is wired up (calls
// RailRadarAdapter.fetchLiveStatus); no producer/scheduler enqueues jobs on
// an actual interval yet — that's the next piece.
const ingestionQueue = new Queue("ingestion", { connection });

module.exports = ingestionQueue;
