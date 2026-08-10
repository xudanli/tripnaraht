-- Team Hub · Team Ledger (peer expenses + settlement confirms, integer cents)

CREATE TABLE "trip_ledger_expenses" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payer_member_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'CNY',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "split_member_ids" JSONB NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_ledger_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_ledger_expenses_trip_id_deleted_at_occurred_at_idx"
    ON "trip_ledger_expenses"("trip_id", "deleted_at", "occurred_at" DESC);

CREATE INDEX "trip_ledger_expenses_trip_id_status_deleted_at_idx"
    ON "trip_ledger_expenses"("trip_id", "status", "deleted_at");

ALTER TABLE "trip_ledger_expenses"
    ADD CONSTRAINT "trip_ledger_expenses_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "trip_ledger_transfer_confirms" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "from_member_id" TEXT NOT NULL,
    "to_member_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'settled',
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_ledger_transfer_confirms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_ledger_transfer_confirms_trip_from_to_amount_key"
    ON "trip_ledger_transfer_confirms"("trip_id", "from_member_id", "to_member_id", "amount_cents");

CREATE INDEX "trip_ledger_transfer_confirms_trip_id_idx"
    ON "trip_ledger_transfer_confirms"("trip_id");

ALTER TABLE "trip_ledger_transfer_confirms"
    ADD CONSTRAINT "trip_ledger_transfer_confirms_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
