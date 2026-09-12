-- CreateTable
CREATE TABLE "NewsEvent" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceOutlet" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "trustTier" TEXT NOT NULL DEFAULT 'established-outlet',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsEventMatch" (
    "id" TEXT NOT NULL,
    "newsEventId" TEXT NOT NULL,
    "stationVisitId" TEXT NOT NULL,
    "matchedOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsEventMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsEvent_sourceUrl_key" ON "NewsEvent"("sourceUrl");

-- CreateIndex
CREATE INDEX "NewsEvent_publishedAt_idx" ON "NewsEvent"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsEventMatch_newsEventId_stationVisitId_key" ON "NewsEventMatch"("newsEventId", "stationVisitId");

-- AddForeignKey
ALTER TABLE "NewsEventMatch" ADD CONSTRAINT "NewsEventMatch_newsEventId_fkey" FOREIGN KEY ("newsEventId") REFERENCES "NewsEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsEventMatch" ADD CONSTRAINT "NewsEventMatch_stationVisitId_fkey" FOREIGN KEY ("stationVisitId") REFERENCES "StationVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
