-- P-OPS-2: append-only prediction snapshots + optional outcome for reality audit / replay

CREATE TABLE "ops_reality_audit_snapshots" (
    "id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trip_id" VARCHAR(128),
    "request_id" VARCHAR(120),
    "decision_run_id" VARCHAR(80),
    "schema_version" VARCHAR(40) NOT NULL DEFAULT 'p-ops-2/v1',
    "prediction_fingerprint" VARCHAR(64) NOT NULL,
    "prediction" JSONB NOT NULL,
    "outcome" JSONB,
    "outcome_recorded_at" TIMESTAMPTZ(6),
    "outcome_source" VARCHAR(40),

    CONSTRAINT "ops_reality_audit_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ops_reality_audit_snapshots_captured_at_idx" ON "ops_reality_audit_snapshots"("captured_at" DESC);
CREATE INDEX "ops_reality_audit_snapshots_trip_id_idx" ON "ops_reality_audit_snapshots"("trip_id");
CREATE INDEX "ops_reality_audit_snapshots_request_id_idx" ON "ops_reality_audit_snapshots"("request_id");
CREATE INDEX "ops_reality_audit_snapshots_decision_run_id_idx" ON "ops_reality_audit_snapshots"("decision_run_id");
