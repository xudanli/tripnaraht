-- Policy Lifecycle v1: bundle version snapshots + selection audit log

CREATE TABLE "route_planning_policy_bundle_versions" (
    "id" UUID NOT NULL,
    "bundle_key" VARCHAR(128) NOT NULL,
    "revision" VARCHAR(256) NOT NULL,
    "scope" VARCHAR(32) NOT NULL DEFAULT 'GLOBAL',
    "definition" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_planning_policy_bundle_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "route_planning_policy_bundle_versions_bundle_key_revision_key" ON "route_planning_policy_bundle_versions"("bundle_key", "revision");

CREATE INDEX "route_planning_policy_bundle_versions_bundle_key_idx" ON "route_planning_policy_bundle_versions"("bundle_key");

CREATE TABLE "policy_selection_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country_code" VARCHAR(8) NOT NULL,
    "trip_id" VARCHAR(128),
    "context_snapshot" JSONB NOT NULL,
    "selected_bundle_id" VARCHAR(128) NOT NULL,
    "routing_rule_id" VARCHAR(128),
    "selection_reason" VARCHAR(64) NOT NULL,
    "effective_revision" VARCHAR(256) NOT NULL,
    "bundle_version_id" UUID,

    CONSTRAINT "policy_selection_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "policy_selection_logs_created_at_idx" ON "policy_selection_logs"("created_at");

CREATE INDEX "policy_selection_logs_trip_id_idx" ON "policy_selection_logs"("trip_id");

CREATE INDEX "policy_selection_logs_country_code_created_at_idx" ON "policy_selection_logs"("country_code", "created_at");

ALTER TABLE "policy_selection_logs" ADD CONSTRAINT "policy_selection_logs_bundle_version_id_fkey" FOREIGN KEY ("bundle_version_id") REFERENCES "route_planning_policy_bundle_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
