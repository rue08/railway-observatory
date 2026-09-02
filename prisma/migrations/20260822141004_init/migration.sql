-- CreateEnum
CREATE TYPE "TrainRunStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Train" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Train_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteStation" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "scheduledArrivalTime" TEXT,
    "scheduledDepartureTime" TEXT,

    CONSTRAINT "RouteStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainRun" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "status" "TrainRunStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sourceProvider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationVisit" (
    "id" TEXT NOT NULL,
    "trainRunId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "scheduledArrivalAt" TIMESTAMP(3),
    "scheduledDepartureAt" TIMESTAMP(3),
    "actualArrivalAt" TIMESTAMP(3),
    "actualDepartureAt" TIMESTAMP(3),
    "arrivalDelayMinutes" INTEGER,
    "departureDelayMinutes" INTEGER,
    "visibilityMeters" INTEGER,
    "primaryReasonTag" TEXT,
    "sourceProvider" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE INDEX "Station_latitude_longitude_idx" ON "Station"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "Train_number_key" ON "Train"("number");

-- CreateIndex
CREATE INDEX "RouteStation_stationId_idx" ON "RouteStation"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStation_trainId_sequenceNumber_key" ON "RouteStation"("trainId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TrainRun_trainId_serviceDate_key" ON "TrainRun"("trainId", "serviceDate");

-- CreateIndex
CREATE INDEX "StationVisit_trainRunId_sequenceNumber_idx" ON "StationVisit"("trainRunId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "StationVisit_stationId_loggedAt_idx" ON "StationVisit"("stationId", "loggedAt");

-- AddForeignKey
ALTER TABLE "RouteStation" ADD CONSTRAINT "RouteStation_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStation" ADD CONSTRAINT "RouteStation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainRun" ADD CONSTRAINT "TrainRun_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationVisit" ADD CONSTRAINT "StationVisit_trainRunId_fkey" FOREIGN KEY ("trainRunId") REFERENCES "TrainRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationVisit" ADD CONSTRAINT "StationVisit_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
