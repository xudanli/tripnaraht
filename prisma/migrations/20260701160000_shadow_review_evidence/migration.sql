-- Task E0: Shadow Review Evidence Persistence

CREATE TABLE "decision_shadow_comparison" (
    "id" UUID NOT NULL,
    "comparison_id" VARCHAR(128) NOT NULL,
    "decision_run_id" VARCHAR(256) NOT NULL,
    "trip_id" VARCHAR(128) NOT NULL,
    "snapshot_id" VARCHAR(128) NOT NULL,
    "snapshot_hash" VARCHAR(64) NOT NULL,
    "candidate_set_hash" VARCHAR(64) NOT NULL,
    "constraint_report_hash" VARCHAR(64) NOT NULL,
    "objective_config_hash" VARCHAR(64) NOT NULL,
    "authority_strategy_id" VARCHAR(64) NOT NULL,
    "authority_strategy_version" VARCHAR(32),
    "shadow_strategy_id" VARCHAR(64) NOT NULL,
    "shadow_strategy_version" VARCHAR(32),
    "authority_winner_id" VARCHAR(128),
    "shadow_winner_id" VARCHAR(128),
    "eligible_for_strategy_comparison" BOOLEAN NOT NULL,
    "divergence_types" TEXT[],
    "divergence_severity" VARCHAR(16) NOT NULL,
    "event_json" JSONB NOT NULL,
    "authority_result_json" JSONB NOT NULL,
    "shadow_result_json" JSONB,
    "stage_traces_json" JSONB,
    "review_artifacts_json" JSONB,
    "experiment_id" VARCHAR(128),
    "scenario_id" VARCHAR(128),
    "benchmark_run_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_shadow_comparison_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decision_shadow_comparison_comparison_id_key" ON "decision_shadow_comparison"("comparison_id");
CREATE INDEX "decision_shadow_comparison_trip_id_created_at_idx" ON "decision_shadow_comparison"("trip_id", "created_at" DESC);
CREATE INDEX "decision_shadow_comparison_decision_run_id_idx" ON "decision_shadow_comparison"("decision_run_id");
CREATE INDEX "decision_shadow_comparison_benchmark_run_id_idx" ON "decision_shadow_comparison"("benchmark_run_id");

CREATE TABLE "decision_shadow_review_case" (
    "id" UUID NOT NULL,
    "review_case_id" VARCHAR(128) NOT NULL,
    "comparison_id" VARCHAR(128) NOT NULL,
    "trip_id" VARCHAR(128) NOT NULL,
    "decision_run_id" VARCHAR(256) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "blinded_option_a_json" JSONB NOT NULL,
    "blinded_option_b_json" JSONB NOT NULL,
    "frozen_snapshots_json" JSONB NOT NULL,
    "blinding_version" VARCHAR(16) NOT NULL,
    "blind_mapping_encrypted" TEXT NOT NULL,
    "divergence_types" TEXT[],
    "divergence_severity" VARCHAR(16) NOT NULL,
    "eligibility_version" VARCHAR(16) NOT NULL,
    "exclusion_reason" VARCHAR(64),
    "expected_review_count" INTEGER NOT NULL DEFAULT 1,
    "completed_review_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_shadow_review_case_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decision_shadow_review_case_review_case_id_key" ON "decision_shadow_review_case"("review_case_id");
CREATE UNIQUE INDEX "decision_shadow_review_case_comparison_id_key" ON "decision_shadow_review_case"("comparison_id");
CREATE INDEX "decision_shadow_review_case_status_created_at_idx" ON "decision_shadow_review_case"("status", "created_at" DESC);
CREATE INDEX "decision_shadow_review_case_trip_id_idx" ON "decision_shadow_review_case"("trip_id");

ALTER TABLE "decision_shadow_review_case" ADD CONSTRAINT "decision_shadow_review_case_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "decision_shadow_comparison"("comparison_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "decision_shadow_review_submission" (
    "id" UUID NOT NULL,
    "submission_id" VARCHAR(128) NOT NULL,
    "review_case_id" VARCHAR(128) NOT NULL,
    "reviewer_id" VARCHAR(128) NOT NULL,
    "reviewer_group" VARCHAR(32),
    "preferred_option" VARCHAR(32) NOT NULL,
    "classification" VARCHAR(32) NOT NULL,
    "scores_json" JSONB NOT NULL,
    "trade_off_summary" TEXT,
    "confidence" INTEGER,
    "review_duration_ms" INTEGER,
    "review_form_version" VARCHAR(16) NOT NULL DEFAULT 'v1',
    "idempotency_key" VARCHAR(256),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_shadow_review_submission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decision_shadow_review_submission_submission_id_key" ON "decision_shadow_review_submission"("submission_id");
CREATE UNIQUE INDEX "decision_shadow_review_submission_idempotency_key_key" ON "decision_shadow_review_submission"("idempotency_key");
CREATE UNIQUE INDEX "decision_shadow_review_submission_review_case_id_reviewer_id_key" ON "decision_shadow_review_submission"("review_case_id", "reviewer_id");
CREATE INDEX "decision_shadow_review_submission_review_case_id_idx" ON "decision_shadow_review_submission"("review_case_id");

ALTER TABLE "decision_shadow_review_submission" ADD CONSTRAINT "decision_shadow_review_submission_review_case_id_fkey" FOREIGN KEY ("review_case_id") REFERENCES "decision_shadow_review_case"("review_case_id") ON DELETE RESTRICT ON UPDATE CASCADE;
