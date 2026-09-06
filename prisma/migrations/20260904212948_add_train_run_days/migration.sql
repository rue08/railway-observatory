-- AlterTable
ALTER TABLE "Train" ADD COLUMN     "runDays" TEXT[] DEFAULT ARRAY[]::TEXT[];
