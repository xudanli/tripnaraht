-- Trip wishlist items (private wishlist for planning workbench)
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "trip_wish_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "text" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "input_mode" VARCHAR(16) NOT NULL,
    "source_ref" JSONB,
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'private',
    "agent_eligible" BOOLEAN NOT NULL DEFAULT true,
    "structured_hints" JSONB,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_wish_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trip_wish_items_trip_user_status_idx"
  ON "trip_wish_items"("trip_id", "user_id", "status");

CREATE INDEX IF NOT EXISTS "trip_wish_items_trip_visibility_status_idx"
  ON "trip_wish_items"("trip_id", "visibility", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_wish_items_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_wish_items"
      ADD CONSTRAINT "trip_wish_items_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
