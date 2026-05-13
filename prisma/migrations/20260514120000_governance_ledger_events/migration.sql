-- Append-only governance ledger (event sourcing). No UPDATE from application layer.

CREATE TABLE "governance_ledger_events" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT,
    "timestamp_ms" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_level" TEXT NOT NULL,
    "execution_status" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "caused_by_policies" JSONB NOT NULL,
    "affected_subsystems" JSONB NOT NULL,
    "recovery_actions" JSONB,
    "execution_context" JSONB,
    "execution_decision" JSONB NOT NULL,
    "route_region" TEXT,
    "country_code" VARCHAR(8),
    "correlation_id" TEXT NOT NULL,
    "causality_chain_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_ledger_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "governance_ledger_events_trip_id_timestamp_ms_idx"
    ON "governance_ledger_events" ("trip_id", "timestamp_ms" DESC);

CREATE INDEX "governance_ledger_events_event_type_timestamp_ms_idx"
    ON "governance_ledger_events" ("event_type", "timestamp_ms" DESC);

CREATE INDEX "governance_ledger_events_route_region_idx"
    ON "governance_ledger_events" ("route_region");
