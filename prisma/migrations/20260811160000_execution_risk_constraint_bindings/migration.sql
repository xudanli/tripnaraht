-- Risk knowledge ↔ trip constraint bindings (config bridge)
CREATE TABLE IF NOT EXISTS "execution_risk_constraint_bindings" (
    "id" VARCHAR(64) NOT NULL,
    "knowledge_version_id" VARCHAR(32),
    "knowledge_code" VARCHAR(64) NOT NULL,
    "severity_level" VARCHAR(32),
    "constraint_category" VARCHAR(32) NOT NULL,
    "constraint_type" VARCHAR(16) NOT NULL,
    "constraint_template_id" VARCHAR(64) NOT NULL,
    "feasibility_dimension" VARCHAR(32),
    "execution_gate" VARCHAR(32),
    "violation_class" VARCHAR(32),
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "notes_zh" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "execution_risk_constraint_bindings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "execution_risk_constraint_bindings_knowledge_code_severity_level_idx"
  ON "execution_risk_constraint_bindings"("knowledge_code", "severity_level");

CREATE INDEX IF NOT EXISTS "execution_risk_constraint_bindings_constraint_template_id_idx"
  ON "execution_risk_constraint_bindings"("constraint_template_id");

CREATE INDEX IF NOT EXISTS "execution_risk_constraint_bindings_knowledge_version_id_idx"
  ON "execution_risk_constraint_bindings"("knowledge_version_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'execution_risk_constraint_bindings_knowledge_version_id_fkey'
  ) THEN
    ALTER TABLE "execution_risk_constraint_bindings"
      ADD CONSTRAINT "execution_risk_constraint_bindings_knowledge_version_id_fkey"
      FOREIGN KEY ("knowledge_version_id") REFERENCES "execution_risk_knowledge_versions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
