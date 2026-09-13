module.exports = {
  ingestionQueue: require("./ingestion.queue"),
  normalizeAndCorrelateQueue: require("./normalizeAndCorrelate.queue"),
  schedulerQueue: require("./scheduler.queue"),
  newsQueue: require("./news.queue"),
  delayAttributionQueue: require("./delayAttribution.queue"),
};
