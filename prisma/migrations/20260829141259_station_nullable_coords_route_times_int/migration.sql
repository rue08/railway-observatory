/*
  Warnings:

  - The `scheduledArrivalTime` column on the `RouteStation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `scheduledDepartureTime` column on the `RouteStation` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "RouteStation" DROP COLUMN "scheduledArrivalTime",
ADD COLUMN     "scheduledArrivalTime" INTEGER,
DROP COLUMN "scheduledDepartureTime",
ADD COLUMN     "scheduledDepartureTime" INTEGER;

-- AlterTable
ALTER TABLE "Station" ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;
