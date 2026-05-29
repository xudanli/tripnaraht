-- LLM token usage audit trail (route_and_run + LlmService unified exit)
CREATE TABLE IF NOT EXISTS "llm_token_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" VARCHAR(255) NOT NULL,
    "span_id" VARCHAR(255),
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "step_name" VARCHAR(64) NOT NULL,
    "sub_agent" VARCHAR(64),
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "is_estimated" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "duration_ms" INTEGER,
    "cost_usd" DECIMAL(12,6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_token_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "llm_token_logs_request_id_idx" ON "llm_token_logs"("request_id");
CREATE INDEX IF NOT EXISTS "llm_token_logs_created_at_idx" ON "llm_token_logs"("created_at");
CREATE INDEX IF NOT EXISTS "llm_token_logs_provider_idx" ON "llm_token_logs"("provider");
CREATE INDEX IF NOT EXISTS "llm_token_logs_step_name_idx" ON "llm_token_logs"("step_name");
