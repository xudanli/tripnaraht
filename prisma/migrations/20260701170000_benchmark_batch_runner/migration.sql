-- Task E1 — Benchmark batch runner with staged checkpoint/resume

CREATE TABLE "decision_benchmark_run" (
    "id" UUID NOT NULL,
    "benchmark_run_id" VARCHAR(128) NOT NULL,
    "benchmark_version" VARCHAR(32) NOT NULL,
    "dataset_version" VARCHAR(32) NOT NULL,
    "dataset_checksum" VARCHAR(64) NOT NULL,
    "split" VARCHAR(16) NOT NULL,
    "runtime_mode" VARCHAR(32) NOT NULL,
    "authority_strategy_id" VARCHAR(64) NOT NULL,
    "shadow_strategy_id" VARCHAR(64) NOT NULL,
    "solver_engine" VARCHAR(64) NOT NULL,
    "objective_registry_version" VARCHAR(32) NOT NULL,
    "constraint_policy_version" VARCHAR(32) NOT NULL,
    "config_json" JSONB NOT NULL,
    "config_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    "total_instances" INTEGER NOT NULL,
    "completed_instances" INTEGER NOT NULL DEFAULT 0,
    "failed_instances" INTEGER NOT NULL DEFAULT 0,
    "excluded_instances" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "shadow_wait_timeout_ms" INTEGER NOT NULL DEFAULT 120000,
    "git_commit" VARCHAR(64),
    "environment_hash" VARCHAR(64),
    "forked_from_run_id" VARCHAR(128),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_benchmark_run_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decision_benchmark_run_benchmark_run_id_key" ON "decision_benchmark_run"("benchmark_run_id");
CREATE INDEX "decision_benchmark_run_status_started_at_idx" ON "decision_benchmark_run"("status", "started_at" DESC);

CREATE TABLE "decision_benchmark_instance_execution" (
    "id" UUID NOT NULL,
    "benchmark_run_id" VARCHAR(128) NOT NULL,
    "instance_id" VARCHAR(128) NOT NULL,
    "strategy_variant" VARCHAR(32) NOT NULL DEFAULT 'default',
    "seed" INTEGER NOT NULL DEFAULT 0,
    "partition" VARCHAR(32),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "request_id" VARCHAR(256) NOT NULL,
    "decision_run_id" VARCHAR(256),
    "comparison_id" VARCHAR(128),
    "review_case_id" VARCHAR(128),
    "input_hash" VARCHAR(64) NOT NULL,
    "request_hash" VARCHAR(64),
    "authority_response_hash" VARCHAR(64),
    "shadow_event_hash" VARCHAR(64),
    "authority_winner_id" VARCHAR(128),
    "shadow_winner_id" VARCHAR(128),
    "eligible_for_strategy_comparison" BOOLEAN,
    "divergence_types" TEXT[],
    "exclusion_reason" VARCHAR(64),
    "failure_class" VARCHAR(32),
    "last_error_code" VARCHAR(64),
    "last_error_message" TEXT,
    "last_error_stage" VARCHAR(32),
    "locked_by" VARCHAR(128),
    "lease_expires_at" TIMESTAMPTZ(6),
    "heartbeat_at" TIMESTAMPTZ(6),
    "artifact_directory" VARCHAR(512),
    "started_at" TIMESTAMPTZ(6),
    "authority_completed_at" TIMESTAMPTZ(6),
    "shadow_completed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_benchmark_instance_execution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decision_benchmark_instance_execution_request_id_key" ON "decision_benchmark_instance_execution"("request_id");
CREATE UNIQUE INDEX "decision_benchmark_instance_execution_run_instance_variant_seed_key" ON "decision_benchmark_instance_execution"("benchmark_run_id", "instance_id", "strategy_variant", "seed");
CREATE INDEX "decision_benchmark_instance_execution_benchmark_run_id_status_idx" ON "decision_benchmark_instance_execution"("benchmark_run_id", "status");
CREATE INDEX "decision_benchmark_instance_execution_benchmark_run_id_created_at_idx" ON "decision_benchmark_instance_execution"("benchmark_run_id", "created_at");

ALTER TABLE "decision_benchmark_instance_execution" ADD CONSTRAINT "decision_benchmark_instance_execution_benchmark_run_id_fkey" FOREIGN KEY ("benchmark_run_id") REFERENCES "decision_benchmark_run"("benchmark_run_id") ON DELETE RESTRICT ON UPDATE CASCADE;
