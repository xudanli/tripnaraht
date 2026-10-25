-- Decision Problem 物化投影：用户/Admin 列表读库，写路径按 tripRevision 刷新

CREATE TABLE IF NOT EXISTS "decision_problem_projections" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "problem_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "summary" TEXT,
    "semantic_key" VARCHAR(255),
    "issue_kind" VARCHAR(64),
    "type" VARCHAR(64),
    "dimension" VARCHAR(64),
    "workflow_status" VARCHAR(64),
    "phase" VARCHAR(64),
    "category_label" VARCHAR(128),
    "enforcement" VARCHAR(64),
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "is_same_day_travel" BOOLEAN NOT NULL DEFAULT false,
    "trip_revision" VARCHAR(191) NOT NULL,
    "trip_name" VARCHAR(200),
    "trip_destination" VARCHAR(16),
    "trip_status" VARCHAR(32),
    "list_item_json" JSONB,
    "materialized_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_problem_projections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "decision_problem_projections_trip_id_problem_id_key"
    ON "decision_problem_projections"("trip_id", "problem_id");

CREATE INDEX IF NOT EXISTS "decision_problem_projections_trip_id_is_open_idx"
    ON "decision_problem_projections"("trip_id", "is_open");

CREATE INDEX IF NOT EXISTS "decision_problem_projections_same_day_open_updated_idx"
    ON "decision_problem_projections"("is_same_day_travel", "is_open", "updated_at");

CREATE INDEX IF NOT EXISTS "decision_problem_projections_semantic_key_idx"
    ON "decision_problem_projections"("semantic_key");

CREATE INDEX IF NOT EXISTS "decision_problem_projections_issue_kind_is_open_idx"
    ON "decision_problem_projections"("issue_kind", "is_open");

CREATE INDEX IF NOT EXISTS "decision_problem_projections_trip_id_trip_revision_idx"
    ON "decision_problem_projections"("trip_id", "trip_revision");
