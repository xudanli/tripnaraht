-- Execution Risk Knowledge catalog (Package V1 import target)

CREATE TABLE IF NOT EXISTS "execution_risk_knowledge_versions" (
    "id" VARCHAR(32) NOT NULL,
    "package_version" VARCHAR(16) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "source_path" VARCHAR(512) NOT NULL,
    "row_counts" JSONB NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_risk_knowledge_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "execution_risk_definitions" (
    "id" VARCHAR(64) NOT NULL,
    "knowledge_version_id" VARCHAR(32) NOT NULL,
    "canonical_code" VARCHAR(128) NOT NULL,
    "knowledge_code" VARCHAR(64) NOT NULL,
    "risk_type" VARCHAR(64) NOT NULL,
    "display_name" JSONB NOT NULL,
    "definition" TEXT NOT NULL,
    "is_root_cause" BOOLEAN NOT NULL,
    "source_aliases" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "since" VARCHAR(32),
    "generation_mode" VARCHAR(32),
    "capability_status" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_risk_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_risk_definitions_knowledge_version_id_fkey"
        FOREIGN KEY ("knowledge_version_id") REFERENCES "execution_risk_knowledge_versions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "execution_risk_definitions_knowledge_version_id_knowledge_code_key"
    ON "execution_risk_definitions"("knowledge_version_id", "knowledge_code");
CREATE INDEX IF NOT EXISTS "execution_risk_definitions_knowledge_code_idx"
    ON "execution_risk_definitions"("knowledge_code");
CREATE INDEX IF NOT EXISTS "execution_risk_definitions_canonical_code_idx"
    ON "execution_risk_definitions"("canonical_code");

CREATE TABLE IF NOT EXISTS "execution_risk_severity_rules" (
    "id" VARCHAR(128) NOT NULL,
    "knowledge_version_id" VARCHAR(32) NOT NULL,
    "knowledge_code" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_risk_severity_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_risk_severity_rules_knowledge_version_id_fkey"
        FOREIGN KEY ("knowledge_version_id") REFERENCES "execution_risk_knowledge_versions"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_risk_severity_rules_version_code_idx"
    ON "execution_risk_severity_rules"("knowledge_version_id", "knowledge_code");

CREATE TABLE IF NOT EXISTS "execution_risk_causal_chains" (
    "id" VARCHAR(64) NOT NULL,
    "knowledge_version_id" VARCHAR(32) NOT NULL,
    "knowledge_code" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_risk_causal_chains_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_risk_causal_chains_knowledge_version_id_fkey"
        FOREIGN KEY ("knowledge_version_id") REFERENCES "execution_risk_knowledge_versions"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_risk_causal_chains_version_code_idx"
    ON "execution_risk_causal_chains"("knowledge_version_id", "knowledge_code");

CREATE TABLE IF NOT EXISTS "execution_risk_intervention_actions" (
    "id" VARCHAR(128) NOT NULL,
    "knowledge_version_id" VARCHAR(32) NOT NULL,
    "action_category" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_risk_intervention_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_risk_intervention_actions_knowledge_version_id_fkey"
        FOREIGN KEY ("knowledge_version_id") REFERENCES "execution_risk_knowledge_versions"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_risk_intervention_actions_version_category_idx"
    ON "execution_risk_intervention_actions"("knowledge_version_id", "action_category");

CREATE TABLE IF NOT EXISTS "execution_risk_code_mappings" (
    "id" VARCHAR(64) NOT NULL,
    "knowledge_version_id" VARCHAR(32) NOT NULL,
    "canonical_code" VARCHAR(128) NOT NULL,
    "knowledge_code" VARCHAR(64) NOT NULL,
    "risk_type" VARCHAR(64) NOT NULL,
    "source_aliases" JSONB NOT NULL,
    "is_root_cause" BOOLEAN NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_risk_code_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execution_risk_code_mappings_knowledge_version_id_fkey"
        FOREIGN KEY ("knowledge_version_id") REFERENCES "execution_risk_knowledge_versions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "execution_risk_code_mappings_knowledge_version_id_knowledge_code_key"
    ON "execution_risk_code_mappings"("knowledge_version_id", "knowledge_code");
CREATE INDEX IF NOT EXISTS "execution_risk_code_mappings_canonical_code_idx"
    ON "execution_risk_code_mappings"("canonical_code");
