-- Team Ledger: optional itinerary item link for activity-detail echo / prefill

ALTER TABLE "trip_ledger_expenses"
    ADD COLUMN IF NOT EXISTS "itinerary_item_id" TEXT;

CREATE INDEX IF NOT EXISTS "trip_ledger_expenses_trip_id_itinerary_item_id_idx"
    ON "trip_ledger_expenses"("trip_id", "itinerary_item_id");
