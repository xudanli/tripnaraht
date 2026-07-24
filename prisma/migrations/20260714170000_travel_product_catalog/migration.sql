-- Travel Product Catalog five-layer skeleton
-- Place → ExperienceDefinition → ProductOffering → ProductSession → RatePlan
-- + Operator + ProductPlaceLink; ItineraryItem optional FK bindings

CREATE TYPE "TravelProductType" AS ENUM (
  'ACTIVITY_EXPERIENCE',
  'SCENIC_FLIGHT',
  'CRUISE_BOAT_TOUR',
  'GUIDED_TOUR',
  'ADMISSION_TICKET',
  'TRANSPORT_SERVICE',
  'RENTAL',
  'DINING_RESERVATION'
);

CREATE TYPE "ProductOfferingStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'SUSPENDED',
  'RETIRED'
);

CREATE TYPE "ProductSessionStatus" AS ENUM (
  'SCHEDULED',
  'CONFIRMED',
  'ON_HOLD',
  'CANCELLED',
  'COMPLETED',
  'WEATHER_HOLD'
);

CREATE TYPE "OperatorTrustLevel" AS ENUM (
  'UNVERIFIED',
  'BASIC',
  'VERIFIED',
  'PREFERRED'
);

CREATE TYPE "ProductPlaceSpatialRole" AS ENUM (
  'MEETING_POINT',
  'START_POINT',
  'END_POINT',
  'PICKUP_POINT',
  'OPERATING_AREA',
  'RELATED_PLACE',
  'FALLBACK_POINT',
  'PARKING'
);

CREATE TABLE IF NOT EXISTS "experience_definition" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "product_type" "TravelProductType" NOT NULL,
  "category_code" VARCHAR(64) NOT NULL,
  "subtype_code" VARCHAR(64) NOT NULL,
  "display_name_zh" VARCHAR(128) NOT NULL,
  "display_name_en" VARCHAR(128) NOT NULL,
  "typical_duration_min" INTEGER,
  "fitness_level" VARCHAR(32),
  "risk_level" VARCHAR(32),
  "recommended_min_age" INTEGER,
  "recommended_max_age" INTEGER,
  "equipment_typical" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "seasonality_notes" TEXT,
  "weather_dependency" VARCHAR(32),
  "common_cancel_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requires_guide" BOOLEAN NOT NULL DEFAULT false,
  "requires_license" BOOLEAN NOT NULL DEFAULT false,
  "related_experience_atom_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "country_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "experience_definition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "experience_definition_code_key"
  ON "experience_definition"("code");
CREATE INDEX IF NOT EXISTS "experience_definition_product_type_category_code_subtype_code_idx"
  ON "experience_definition"("product_type", "category_code", "subtype_code");
CREATE INDEX IF NOT EXISTS "experience_definition_country_codes_idx"
  ON "experience_definition" USING GIN ("country_codes");

CREATE TABLE IF NOT EXISTS "travel_operator" (
  "id" TEXT NOT NULL,
  "brand_name" VARCHAR(128) NOT NULL,
  "legal_name" VARCHAR(256),
  "country_code" VARCHAR(8),
  "operating_regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contact_email" VARCHAR(256),
  "contact_phone" VARCHAR(64),
  "website" VARCHAR(512),
  "licenses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "insurance_summary" TEXT,
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cancellation_policy_summary" TEXT,
  "data_sources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "distribution_channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "external_operator_id" VARCHAR(128),
  "trust_level" "OperatorTrustLevel" NOT NULL DEFAULT 'UNVERIFIED',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "travel_operator_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "travel_operator_country_code_idx" ON "travel_operator"("country_code");
CREATE INDEX IF NOT EXISTS "travel_operator_brand_name_idx" ON "travel_operator"("brand_name");
CREATE INDEX IF NOT EXISTS "travel_operator_external_operator_id_idx" ON "travel_operator"("external_operator_id");

CREATE TABLE IF NOT EXISTS "product_offering" (
  "id" TEXT NOT NULL,
  "experience_definition_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "name_en" VARCHAR(256) NOT NULL,
  "name_cn" VARCHAR(256),
  "description" TEXT,
  "product_type" "TravelProductType" NOT NULL,
  "category_code" VARCHAR(64) NOT NULL,
  "subtype_code" VARCHAR(64) NOT NULL,
  "default_duration_min" INTEGER,
  "included" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excluded" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "min_age" INTEGER,
  "max_age" INTEGER,
  "min_height_cm" INTEGER,
  "max_weight_kg" DOUBLE PRECISION,
  "fitness_requirement" VARCHAR(64),
  "equipment_required" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cancellation_policy" TEXT,
  "safety_rules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "booking_channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "external_product_id" VARCHAR(128),
  "status" "ProductOfferingStatus" NOT NULL DEFAULT 'DRAFT',
  "country_code" VARCHAR(8),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "product_offering_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_offering_experience_definition_id_fkey"
    FOREIGN KEY ("experience_definition_id") REFERENCES "experience_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_offering_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "travel_operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "product_offering_experience_definition_id_idx" ON "product_offering"("experience_definition_id");
CREATE INDEX IF NOT EXISTS "product_offering_operator_id_idx" ON "product_offering"("operator_id");
CREATE INDEX IF NOT EXISTS "product_offering_product_type_category_code_subtype_code_idx"
  ON "product_offering"("product_type", "category_code", "subtype_code");
CREATE INDEX IF NOT EXISTS "product_offering_status_country_code_idx" ON "product_offering"("status", "country_code");
CREATE INDEX IF NOT EXISTS "product_offering_external_product_id_idx" ON "product_offering"("external_product_id");

CREATE TABLE IF NOT EXISTS "product_place_link" (
  "id" TEXT NOT NULL,
  "offering_id" TEXT NOT NULL,
  "place_id" INTEGER NOT NULL,
  "role" "ProductPlaceSpatialRole" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "label" VARCHAR(128),
  "geometry" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "product_place_link_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_place_link_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offering"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_place_link_place_id_fkey"
    FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_place_link_offering_id_place_id_role_sort_order_key"
  ON "product_place_link"("offering_id", "place_id", "role", "sort_order");
CREATE INDEX IF NOT EXISTS "product_place_link_place_id_role_idx" ON "product_place_link"("place_id", "role");
CREATE INDEX IF NOT EXISTS "product_place_link_offering_id_role_idx" ON "product_place_link"("offering_id", "role");

CREATE TABLE IF NOT EXISTS "product_session" (
  "id" TEXT NOT NULL,
  "offering_id" TEXT NOT NULL,
  "local_date" DATE NOT NULL,
  "start_time_local" VARCHAR(16),
  "end_time_local" VARCHAR(16),
  "meet_time_local" VARCHAR(16),
  "latest_check_in_local" VARCHAR(16),
  "timezone" VARCHAR(64),
  "capacity_total" INTEGER,
  "capacity_remaining" INTEGER,
  "status" "ProductSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "min_participants" INTEGER,
  "is_guaranteed_departure" BOOLEAN NOT NULL DEFAULT false,
  "weather_status" VARCHAR(64),
  "postponement_or_cancel_status" VARCHAR(64),
  "external_session_id" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "product_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_session_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offering"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "product_session_offering_id_local_date_idx" ON "product_session"("offering_id", "local_date");
CREATE INDEX IF NOT EXISTS "product_session_status_local_date_idx" ON "product_session"("status", "local_date");
CREATE INDEX IF NOT EXISTS "product_session_external_session_id_idx" ON "product_session"("external_session_id");

CREATE TABLE IF NOT EXISTS "rate_plan" (
  "id" TEXT NOT NULL,
  "offering_id" TEXT NOT NULL,
  "session_id" TEXT,
  "code" VARCHAR(64) NOT NULL,
  "name_en" VARCHAR(128) NOT NULL,
  "name_cn" VARCHAR(128),
  "currency" VARCHAR(8) NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "traveler_type" VARCHAR(32),
  "refundable" BOOLEAN,
  "includes_transfer" BOOLEAN,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "inventory_cap" INTEGER,
  "booking_rules" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "rate_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rate_plan_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offering"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rate_plan_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "product_session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_plan_offering_id_code_session_id_key"
  ON "rate_plan"("offering_id", "code", "session_id");
CREATE INDEX IF NOT EXISTS "rate_plan_session_id_idx" ON "rate_plan"("session_id");
CREATE INDEX IF NOT EXISTS "rate_plan_offering_id_traveler_type_idx" ON "rate_plan"("offering_id", "traveler_type");

ALTER TABLE "ItineraryItem"
  ADD COLUMN IF NOT EXISTS "product_offering_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "product_session_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "experience_definition_id" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "ItineraryItem_product_offering_id_idx" ON "ItineraryItem"("product_offering_id");
CREATE INDEX IF NOT EXISTS "ItineraryItem_product_session_id_idx" ON "ItineraryItem"("product_session_id");
CREATE INDEX IF NOT EXISTS "ItineraryItem_experience_definition_id_idx" ON "ItineraryItem"("experience_definition_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ItineraryItem_product_offering_id_fkey'
  ) THEN
    ALTER TABLE "ItineraryItem"
      ADD CONSTRAINT "ItineraryItem_product_offering_id_fkey"
      FOREIGN KEY ("product_offering_id") REFERENCES "product_offering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ItineraryItem_product_session_id_fkey'
  ) THEN
    ALTER TABLE "ItineraryItem"
      ADD CONSTRAINT "ItineraryItem_product_session_id_fkey"
      FOREIGN KEY ("product_session_id") REFERENCES "product_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ItineraryItem_experience_definition_id_fkey'
  ) THEN
    ALTER TABLE "ItineraryItem"
      ADD CONSTRAINT "ItineraryItem_experience_definition_id_fkey"
      FOREIGN KEY ("experience_definition_id") REFERENCES "experience_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
