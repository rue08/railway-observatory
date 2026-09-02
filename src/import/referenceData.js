// Upserts one train's schedule (Train, its Stations, its RouteStations)
// from already-normalized adapter output (see adapters/schemas/
// normalizedReferenceData.js). Prisma client and adapter are both injected,
// not imported directly, so this stays independently testable.
//
// Wrapped in a single transaction — confirmed necessary the hard way: a
// mid-loop failure (Aug 29 2026, a stale-client error) left Train/Station
// committed with zero RouteStation rows, and the cache-first check in
// GET /trains/:trainNumber only looked at Train, so it silently served an
// empty route forever afterward with no error and no retry. All-or-nothing
// avoids the partial-write state; the route's existence check was also
// fixed separately (see routes/trains.js) so a partial state, if one ever
// happens again some other way, gets retried instead of cached as success.
async function importTrainSchedule({ prisma, adapter, trainNumber, logger }) {
  const { train, stations, routeStations } = await adapter.fetchTrainSchedule(trainNumber);

  const trainRow = await prisma.$transaction(
    async (tx) => {
      const trainRow = await tx.train.upsert({
        where: { number: train.number },
        update: { name: train.name },
        create: { number: train.number, name: train.name },
      });

      // latitude/longitude come from the adapter when the source provides
      // them (RailRadar's GET /v1/trains/{number} route data does — see
      // PROJECT.md §13); undefined otherwise, which Prisma treats as
      // "leave unset."
      const stationIdByCode = new Map();
      for (const station of stations) {
        const stationRow = await tx.station.upsert({
          where: { code: station.code },
          update: {
            name: station.name,
            latitude: station.latitude ?? undefined,
            longitude: station.longitude ?? undefined,
          },
          create: {
            code: station.code,
            name: station.name,
            latitude: station.latitude ?? undefined,
            longitude: station.longitude ?? undefined,
          },
        });
        stationIdByCode.set(station.code, stationRow.id);
      }

      for (const rs of routeStations) {
        await tx.routeStation.upsert({
          where: {
            trainId_sequenceNumber: { trainId: trainRow.id, sequenceNumber: rs.sequenceNumber },
          },
          update: {
            stationId: stationIdByCode.get(rs.stationCode),
            arrivalDayOffset: rs.arrivalDayOffset,
            departureDayOffset: rs.departureDayOffset,
            scheduledArrivalTime: rs.scheduledArrivalTime,
            scheduledDepartureTime: rs.scheduledDepartureTime,
          },
          create: {
            trainId: trainRow.id,
            stationId: stationIdByCode.get(rs.stationCode),
            sequenceNumber: rs.sequenceNumber,
            arrivalDayOffset: rs.arrivalDayOffset,
            departureDayOffset: rs.departureDayOffset,
            scheduledArrivalTime: rs.scheduledArrivalTime,
            scheduledDepartureTime: rs.scheduledDepartureTime,
          },
        });
      }

      return trainRow;
    },
    // Default interactive-transaction timeout (5s) isn't enough for a few
    // hundred sequential upserts (12919 alone is 223 stops); generous
    // headroom here, not tuned — revisit if trains with far longer routes
    // show up.
    { timeout: 30_000 }
  );

  logger?.info(
    { trainNumber: train.number, stations: stations.length, routeStations: routeStations.length },
    "Imported train schedule"
  );

  return { train: trainRow, stationCount: stations.length, routeStationCount: routeStations.length };
}

async function importReferenceData({ prisma, adapter, trainNumbers, logger }) {
  const results = [];
  for (const trainNumber of trainNumbers) {
    results.push(await importTrainSchedule({ prisma, adapter, trainNumber, logger }));
  }
  return results;
}

module.exports = { importTrainSchedule, importReferenceData };
