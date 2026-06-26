-- Domain influence mapping (F2.1–F2.3)
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "trip_domain_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "domain" VARCHAR(32) NOT NULL,
    "user_id" TEXT NOT NULL,
    "claim_source" VARCHAR(16) NOT NULL DEFAULT 'explicit',
    "self_score" INTEGER NOT NULL DEFAULT 50,
    "note" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_domain_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_domain_claims_trip_domain_user_key"
  ON "trip_domain_claims"("trip_id", "domain", "user_id");

CREATE INDEX IF NOT EXISTS "trip_domain_claims_trip_domain_idx"
  ON "trip_domain_claims"("trip_id", "domain");

CREATE TABLE IF NOT EXISTS "trip_domain_endorsements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "domain" VARCHAR(32) NOT NULL,
    "claim_user_id" TEXT NOT NULL,
    "endorser_id" TEXT NOT NULL,
    "claim_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_domain_endorsements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_domain_endorsements_unique"
  ON "trip_domain_endorsements"("trip_id", "domain", "claim_user_id", "endorser_id");

CREATE INDEX IF NOT EXISTS "trip_domain_endorsements_trip_domain_idx"
  ON "trip_domain_endorsements"("trip_id", "domain");

CREATE TABLE IF NOT EXISTS "trip_domain_weight_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "domain" VARCHAR(32) NOT NULL,
    "user_id" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'negotiation',
    "set_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_domain_weight_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_domain_weight_overrides_unique"
  ON "trip_domain_weight_overrides"("trip_id", "domain", "user_id");

CREATE INDEX IF NOT EXISTS "trip_domain_weight_overrides_trip_domain_idx"
  ON "trip_domain_weight_overrides"("trip_id", "domain");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_domain_claims_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_domain_claims"
      ADD CONSTRAINT "trip_domain_claims_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_domain_endorsements_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_domain_endorsements"
      ADD CONSTRAINT "trip_domain_endorsements_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_domain_endorsements_claim_id_fkey'
  ) THEN
    ALTER TABLE "trip_domain_endorsements"
      ADD CONSTRAINT "trip_domain_endorsements_claim_id_fkey"
      FOREIGN KEY ("claim_id") REFERENCES "trip_domain_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_domain_weight_overrides_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_domain_weight_overrides"
      ADD CONSTRAINT "trip_domain_weight_overrides_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
