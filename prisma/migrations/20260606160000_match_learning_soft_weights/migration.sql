-- Match Learning P3: soft weight config + weekly run audit

CREATE TABLE IF NOT EXISTS "matching_soft_weight_configs" (
    "id" VARCHAR(40) NOT NULL DEFAULT 'default',
    "weights" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_run_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_soft_weight_configs_pkey" PRIMARY KEY ("id")
);

INSERT INTO "matching_soft_weight_configs" ("id", "weights", "version")
VALUES (
    'default',
    '{"ei":0.25,"tf":0.3,"energy":0.25,"ambiguity":0.2}'::jsonb,
    1
)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "matching_soft_weight_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_id" VARCHAR(40) NOT NULL DEFAULT 'default',
    "week_start" TIMESTAMPTZ(6) NOT NULL,
    "week_end" TIMESTAMPTZ(6) NOT NULL,
    "positive_samples" INTEGER NOT NULL DEFAULT 0,
    "negative_samples" INTEGER NOT NULL DEFAULT 0,
    "weight_before" JSONB NOT NULL,
    "weight_after" JSONB NOT NULL,
    "adjustments" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_soft_weight_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "matching_soft_weight_runs_config_id_idx"
    ON "matching_soft_weight_runs"("config_id");
CREATE INDEX IF NOT EXISTS "matching_soft_weight_runs_created_at_idx"
    ON "matching_soft_weight_runs"("created_at");

ALTER TABLE "matching_soft_weight_runs"
    ADD CONSTRAINT "matching_soft_weight_runs_config_id_fkey"
    FOREIGN KEY ("config_id") REFERENCES "matching_soft_weight_configs"("id") ON DELETE CASCADE;
