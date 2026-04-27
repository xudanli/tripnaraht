-- CBR 判例聚合 + 决策博弈图分析日志（双引擎持久化最小表）

CREATE TABLE IF NOT EXISTS "cbr_case_aggregates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "signature_hash" VARCHAR(64) NOT NULL,
    "conflict_type" VARCHAR(16) NOT NULL,
    "primary_violation_type" VARCHAR(128),
    "region_id" VARCHAR(64),
    "month" INTEGER,
    "relaxation_types_json" JSONB,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "late_accept_count" INTEGER NOT NULL DEFAULT 0,
    "late_accept_rate" DOUBLE PRECISION,
    "avg_wall_hit_latency_ms" DOUBLE PRECISION,
    "avg_wall_hit_event_span" DOUBLE PRECISION,
    "evidence_anchors" JSONB,
    "precedent_summary_latest" TEXT,
    "last_case_id" VARCHAR(255),
    "last_request_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cbr_case_aggregates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cbr_case_aggregates_signature_hash_key"
    ON "cbr_case_aggregates"("signature_hash");

CREATE INDEX IF NOT EXISTS "cbr_case_aggregates_conflict_type_primary_violation_type_idx"
    ON "cbr_case_aggregates"("conflict_type", "primary_violation_type");

CREATE INDEX IF NOT EXISTS "cbr_case_aggregates_updated_at_idx"
    ON "cbr_case_aggregates"("updated_at" DESC);

CREATE TABLE IF NOT EXISTS "decision_intelligence_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" VARCHAR(255),
    "dominant_cid" VARCHAR(128),
    "graph_json" JSONB NOT NULL,
    "efficiency_metrics" JSONB NOT NULL,
    "persuasion_latency_event_span" INTEGER,
    "oscillation_escalated" BOOLEAN NOT NULL DEFAULT false,
    "hard_truth_is_hard" BOOLEAN NOT NULL DEFAULT false,
    "has_conversion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_intelligence_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "decision_intelligence_logs_dominant_cid_created_at_idx"
    ON "decision_intelligence_logs"("dominant_cid", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "decision_intelligence_logs_request_id_idx"
    ON "decision_intelligence_logs"("request_id");

CREATE INDEX IF NOT EXISTS "decision_intelligence_logs_created_at_idx"
    ON "decision_intelligence_logs"("created_at" DESC);
