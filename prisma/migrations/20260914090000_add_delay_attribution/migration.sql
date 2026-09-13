-- CreateEnum
CREATE TYPE "ConfidenceTier" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "DelayAttribution" (
    "id" TEXT NOT NULL,
    "stationVisitId" TEXT NOT NULL,
    "primaryReasonTag" TEXT,
    "confidenceTier" "ConfidenceTier" NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelayAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelayAttributionReason" (
    "id" TEXT NOT NULL,
    "delayAttributionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "matchType" TEXT,
    "detail" TEXT NOT NULL,

    CONSTRAINT "DelayAttributionReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DelayAttribution_stationVisitId_computedAt_idx" ON "DelayAttribution"("stationVisitId", "computedAt");

-- CreateIndex
CREATE INDEX "DelayAttributionReason_delayAttributionId_idx" ON "DelayAttributionReason"("delayAttributionId");

-- AddForeignKey
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_stationVisitId_fkey" FOREIGN KEY ("stationVisitId") REFERENCES "StationVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayAttributionReason" ADD CONSTRAINT "DelayAttributionReason_delayAttributionId_fkey" FOREIGN KEY ("delayAttributionId") REFERENCES "DelayAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
