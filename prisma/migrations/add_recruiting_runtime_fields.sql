-- Migration: Add Recruiting Runtime fields to MatchSquare tables
-- Generated for P2 (Recruiting Runtime) - Attribution + Outcome integration
-- Safe to run multiple times (uses IF NOT EXISTS)

-- 1. Add attribution column to match_square_applications table (if not exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'match_square_applications') THEN
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'match_square_applications' AND column_name = 'attribution'
    ) THEN
      ALTER TABLE "match_square_applications" ADD COLUMN "attribution" JSONB;
    END IF;
  END IF;
END $$;

-- 2. Add outcome column to match_square_posts table (if not exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'match_square_posts') THEN
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'match_square_posts' AND column_name = 'outcome'
    ) THEN
      ALTER TABLE "match_square_posts" ADD COLUMN "outcome" JSONB;
    END IF;
  END IF;
END $$;

-- 3. Add trip_id column to match_square_posts table (if not exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'match_square_posts') THEN
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'match_square_posts' AND column_name = 'trip_id'
    ) THEN
      ALTER TABLE "match_square_posts" ADD COLUMN "trip_id" TEXT;
    END IF;
  END IF;
END $$;

-- 4. Create index on trip_id (if not exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'match_square_posts') THEN
    IF NOT EXISTS (
      SELECT FROM pg_indexes
      WHERE tablename = 'match_square_posts' AND indexname = 'match_square_posts_trip_id_idx'
    ) THEN
      CREATE INDEX "match_square_posts_trip_id_idx" ON "match_square_posts"("trip_id");
    END IF;
  END IF;
END $$;
