-- RFC-003 Phase 1: explicit travel context identity on exploration scenarios
ALTER TABLE "exploration_scenarios" ADD COLUMN IF NOT EXISTS "context_id" UUID;

UPDATE "exploration_scenarios"
SET "context_id" = "id"
WHERE "context_id" IS NULL;

ALTER TABLE "exploration_scenarios" ALTER COLUMN "context_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "exploration_scenarios_context_id_key"
  ON "exploration_scenarios"("context_id");
