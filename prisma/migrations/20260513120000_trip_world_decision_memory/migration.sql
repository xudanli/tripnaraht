-- WDMA: append-only trip / request scoped world decision archive (dual-write with in-memory ring)

CREATE TABLE "trip_world_decision_memory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT,
    "user_id" TEXT,
    "request_id" VARCHAR(256) NOT NULL,
    "causality_id" VARCHAR(128) NOT NULL,
    "decision_type" VARCHAR(32) NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_world_decision_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_world_decision_memory_request_id_causality_id_key"
  ON "trip_world_decision_memory"("request_id", "causality_id");

CREATE INDEX "trip_world_decision_memory_trip_id_created_at_idx"
  ON "trip_world_decision_memory"("trip_id", "created_at");

CREATE INDEX "trip_world_decision_memory_request_id_created_at_idx"
  ON "trip_world_decision_memory"("request_id", "created_at");
