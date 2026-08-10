-- DB already contains SERVICE; Prisma schema was missing it (client crash on findUnique).
ALTER TYPE "PlaceCategory" ADD VALUE IF NOT EXISTS 'SERVICE';
