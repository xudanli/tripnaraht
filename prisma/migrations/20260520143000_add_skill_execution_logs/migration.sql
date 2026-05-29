-- Skill execution audit trail (SkillsRegistry wrapSkillExecution)
CREATE TABLE IF NOT EXISTS "skill_execution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" VARCHAR(255) NOT NULL,
    "span_id" VARCHAR(255),
    "skill_name" VARCHAR(128) NOT NULL,
    "canonical_name" VARCHAR(128),
    "step_name" VARCHAR(64) NOT NULL,
    "sub_agent" VARCHAR(64),
    "route_path" VARCHAR(32),
    "category" VARCHAR(32),
    "success" BOOLEAN NOT NULL DEFAULT true,
    "duration_ms" INTEGER NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_execution_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "skill_execution_logs_request_id_idx" ON "skill_execution_logs"("request_id");
CREATE INDEX IF NOT EXISTS "skill_execution_logs_skill_name_idx" ON "skill_execution_logs"("skill_name");
CREATE INDEX IF NOT EXISTS "skill_execution_logs_canonical_name_idx" ON "skill_execution_logs"("canonical_name");
CREATE INDEX IF NOT EXISTS "skill_execution_logs_created_at_idx" ON "skill_execution_logs"("created_at");
CREATE INDEX IF NOT EXISTS "skill_execution_logs_route_path_idx" ON "skill_execution_logs"("route_path");
