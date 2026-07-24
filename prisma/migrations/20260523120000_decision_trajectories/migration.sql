-- PR-A: Decision OS execution trajectory SSOT (orthogonal to validated_trajectories)

CREATE TABLE IF NOT EXISTS "decision_trajectories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" VARCHAR(255) NOT NULL,
    "trip_id" UUID,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "total_reward" DOUBLE PRECISION,
    "reward_signals" JSONB NOT NULL DEFAULT '[]',
    "orchestration_outcome" VARCHAR(32),
    "legacy_validated_trajectory_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_trajectories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "decision_trajectories_request_id_key" ON "decision_trajectories"("request_id");
CREATE INDEX IF NOT EXISTS "decision_trajectories_trip_id_idx" ON "decision_trajectories"("trip_id");
CREATE INDEX IF NOT EXISTS "decision_trajectories_status_idx" ON "decision_trajectories"("status");
CREATE INDEX IF NOT EXISTS "decision_trajectories_orchestration_outcome_idx" ON "decision_trajectories"("orchestration_outcome");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_trajectories_legacy_validated_trajectory_id_fkey'
  ) THEN
    ALTER TABLE "decision_trajectories"
      ADD CONSTRAINT "decision_trajectories_legacy_validated_trajectory_id_fkey"
      FOREIGN KEY ("legacy_validated_trajectory_id")
      REFERENCES "validated_trajectories"("trajectory_id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
