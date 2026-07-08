-- Canonical POI Resolution Engine — aliases, import queue, resolution audit log

CREATE TABLE IF NOT EXISTS "poi_aliases" (
    "id" SERIAL NOT NULL,
    "poi_id" VARCHAR(191) NOT NULL,
    "alias" VARCHAR(500) NOT NULL,
    "locale" VARCHAR(8),
    "source" VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "poi_aliases_poi_id_alias_key"
    ON "poi_aliases"("poi_id", "alias");
CREATE INDEX IF NOT EXISTS "poi_aliases_alias_idx"
    ON "poi_aliases"("alias");

CREATE TABLE IF NOT EXISTS "poi_import_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "query_name" VARCHAR(500) NOT NULL,
    "external_source" VARCHAR(32) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "resolved_poi_id" VARCHAR(191),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_import_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_import_queue_status_idx"
    ON "poi_import_queue"("status");
CREATE INDEX IF NOT EXISTS "poi_import_queue_query_name_idx"
    ON "poi_import_queue"("query_name");

CREATE TABLE IF NOT EXISTS "poi_resolution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "query_name" VARCHAR(500) NOT NULL,
    "poi_id" VARCHAR(191),
    "method" VARCHAR(32),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "user_id" VARCHAR(191),
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_resolution_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_resolution_logs_query_name_idx"
    ON "poi_resolution_logs"("query_name");
CREATE INDEX IF NOT EXISTS "poi_resolution_logs_poi_id_idx"
    ON "poi_resolution_logs"("poi_id");
