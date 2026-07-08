-- Guide-to-Plan: async parse progress + file source metadata

ALTER TABLE "guide_to_plan_sessions"
  ADD COLUMN IF NOT EXISTS "parse_progress" JSONB;

ALTER TABLE "imported_guides"
  ADD COLUMN IF NOT EXISTS "source_metadata" JSONB;
