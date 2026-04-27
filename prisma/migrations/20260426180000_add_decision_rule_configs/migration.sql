-- Decision Center: SideEffect param overrides (DB-backed hot reload)

CREATE TABLE IF NOT EXISTS "decision_rule_configs" (
    "id" UUID NOT NULL,
    "action_name" VARCHAR(255) NOT NULL,
    "handler_id" VARCHAR(255) NOT NULL,
    "params" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_rule_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "decision_rule_configs_action_name_handler_id_key"
    ON "decision_rule_configs"("action_name", "handler_id");

CREATE INDEX IF NOT EXISTS "decision_rule_configs_is_active_updated_at_idx"
    ON "decision_rule_configs"("is_active", "updated_at");
