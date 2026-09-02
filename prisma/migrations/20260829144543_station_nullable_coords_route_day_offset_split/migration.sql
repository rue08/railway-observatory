/*
  Warnings:

  - You are about to drop the column `dayOffset` on the `RouteStation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RouteStation" DROP COLUMN "dayOffset",
ADD COLUMN     "arrivalDayOffset" INTEGER,
ADD COLUMN     "departureDayOffset" INTEGER;
