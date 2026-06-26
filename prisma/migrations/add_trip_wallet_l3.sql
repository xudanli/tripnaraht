-- L3 Travel Wallet: payment rules + ledger entries
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "trip_wallet_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "default_payer_id" TEXT,
    "split_base" INTEGER NOT NULL DEFAULT 1,
    "category_rules" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_wallet_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_wallet_rules_trip_id_key"
  ON "trip_wallet_rules"("trip_id");

CREATE TABLE IF NOT EXISTS "trip_wallet_ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'CNY',
    "paid_by_user_id" TEXT NOT NULL,
    "split_among_user_ids" JSONB NOT NULL,
    "share_per_person" DOUBLE PRECISION NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_wallet_ledger_entries_trip_source_key"
  ON "trip_wallet_ledger_entries"("trip_id", "source_type", "source_id");

CREATE INDEX IF NOT EXISTS "trip_wallet_ledger_entries_trip_settled_idx"
  ON "trip_wallet_ledger_entries"("trip_id", "settled");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_wallet_rules_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_wallet_rules"
      ADD CONSTRAINT "trip_wallet_rules_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_wallet_ledger_entries_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_wallet_ledger_entries"
      ADD CONSTRAINT "trip_wallet_ledger_entries_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
