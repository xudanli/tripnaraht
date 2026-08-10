-- DB already may contain SUPPLY; Prisma schema was missing it (client crash).
ALTER TYPE "PlaceCategory" ADD VALUE IF NOT EXISTS 'SUPPLY';
