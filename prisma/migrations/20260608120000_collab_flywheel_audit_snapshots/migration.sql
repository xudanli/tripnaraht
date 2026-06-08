-- PRD 3.13 — Match Square 协同飞轮 prediction vs observation audit snapshots

CREATE TABLE "collab_flywheel_audit_snapshots" (
    "id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recruitment_post_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "trip_id" UUID,
    "schema_version" VARCHAR(40) NOT NULL DEFAULT 'collab-flywheel-audit/v1',
    "prediction_fingerprint" VARCHAR(64) NOT NULL,
    "prediction" JSONB NOT NULL,
    "outcome" JSONB,
    "outcome_fingerprint" VARCHAR(64),
    "audit_match" BOOLEAN,
    "outcome_recorded_at" TIMESTAMPTZ(6),
    "outcome_source" VARCHAR(40),

    CONSTRAINT "collab_flywheel_audit_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collab_flywheel_audit_snapshots_application_id_key"
    ON "collab_flywheel_audit_snapshots"("application_id");
CREATE INDEX "collab_flywheel_audit_snapshots_captured_at_idx"
    ON "collab_flywheel_audit_snapshots"("captured_at" DESC);
CREATE INDEX "collab_flywheel_audit_snapshots_trip_id_idx"
    ON "collab_flywheel_audit_snapshots"("trip_id");
CREATE INDEX "collab_flywheel_audit_snapshots_recruitment_post_id_idx"
    ON "collab_flywheel_audit_snapshots"("recruitment_post_id");
