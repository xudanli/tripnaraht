-- B-side fulfillment capability records for Iceland MVP
CREATE TABLE IF NOT EXISTS "fulfillment_capability_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" VARCHAR(128) NOT NULL,
    "supplier_name" VARCHAR(255),
    "country_code" VARCHAR(2) NOT NULL,
    "capability_type" VARCHAR(32) NOT NULL,
    "capability_key" VARCHAR(128) NOT NULL,
    "metrics" JSONB NOT NULL,
    "evidence_trip_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "metadata" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_capability_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fulfillment_capability_records_country_code_capability_type_idx"
    ON "fulfillment_capability_records"("country_code", "capability_type");

CREATE INDEX IF NOT EXISTS "fulfillment_capability_records_supplier_id_idx"
    ON "fulfillment_capability_records"("supplier_id");
