-- Intake 决策闭环训练样本表（规则期 SSOT，支撑 NL→vector / RAG / Bandit 飞轮）

CREATE TABLE IF NOT EXISTS "intake_decision_closures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "decision_os_session_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "user_messages" JSONB NOT NULL,
    "round_texts" JSONB NOT NULL,
    "vector_context" JSONB NOT NULL,
    "country_code" VARCHAR(12),
    "country_resolve_source" VARCHAR(32),
    "geo_parsed" JSONB,
    "destination_scope" VARCHAR(120),
    "compiler_ruleset_version" VARCHAR(32) NOT NULL,
    "geo_ruleset_version" VARCHAR(32) NOT NULL,
    "pareto_ruleset_version" VARCHAR(32) NOT NULL,
    "system_inferred_tier" INTEGER,
    "tier_at_intake_complete" INTEGER,
    "user_selected_tier" INTEGER,
    "tier_selected_at" TIMESTAMPTZ(6),
    "selected_route_node_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pareto_solutions_snapshot" JSONB,
    "preferred_route_node_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "deposit_paid_at" TIMESTAMPTZ(6),
    "deposit_cents" INTEGER,
    "order_id" VARCHAR(255),
    "intake_completed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_decision_closures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "intake_decision_closures_decision_os_session_id_key"
    ON "intake_decision_closures"("decision_os_session_id");
CREATE INDEX IF NOT EXISTS "intake_decision_closures_user_id_idx"
    ON "intake_decision_closures"("user_id");
CREATE INDEX IF NOT EXISTS "intake_decision_closures_country_code_idx"
    ON "intake_decision_closures"("country_code");
CREATE INDEX IF NOT EXISTS "intake_decision_closures_intake_completed_at_idx"
    ON "intake_decision_closures"("intake_completed_at");
