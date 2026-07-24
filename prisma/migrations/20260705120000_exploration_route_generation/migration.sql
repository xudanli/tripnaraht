-- Exploration AI route generation: persist source + personalized detail on variants
ALTER TABLE "exploration_route_variants"
  ADD COLUMN IF NOT EXISTS "generation_source" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "route_detail" JSONB;
