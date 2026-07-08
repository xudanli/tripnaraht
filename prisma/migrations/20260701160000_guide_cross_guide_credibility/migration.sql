-- Cross-guide credibility level on inspiration candidates
ALTER TABLE "guide_inspiration_candidates"
  ADD COLUMN IF NOT EXISTS "credibility_level" VARCHAR(4) NOT NULL DEFAULT 'L1';

CREATE INDEX IF NOT EXISTS "guide_inspiration_candidates_session_id_credibility_level_idx"
  ON "guide_inspiration_candidates" ("session_id", "credibility_level");
