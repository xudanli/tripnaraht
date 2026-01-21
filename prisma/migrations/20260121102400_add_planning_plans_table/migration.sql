-- CreateTable
CREATE TABLE IF NOT EXISTS "planning_plans" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "plan_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "plan_state" JSONB NOT NULL,
    "ui_output" JSONB,
    "summary" JSONB,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planning_plans_trip_id_idx" ON "planning_plans"("trip_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planning_plans_trip_id_status_idx" ON "planning_plans"("trip_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planning_plans_status_idx" ON "planning_plans"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planning_plans_created_at_idx" ON "planning_plans"("created_at");

-- AddForeignKey (only if Trip table exists)
-- Note: Foreign key is optional - table will work without it
-- The foreign key can be added later when Trip table is available
DO $$
DECLARE
  trip_table_name TEXT;
BEGIN
  -- Check which Trip table exists (Trip or trips)
  SELECT table_name INTO trip_table_name
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('Trip', 'trips')
  LIMIT 1;
  
  IF trip_table_name IS NOT NULL THEN
    -- Add foreign key constraint
    BEGIN
      EXECUTE format(
        'ALTER TABLE "planning_plans" ADD CONSTRAINT "planning_plans_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES %I("id") ON DELETE CASCADE ON UPDATE CASCADE',
        trip_table_name
      );
      RAISE NOTICE 'Foreign key constraint added successfully';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to add foreign key constraint: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Trip table not found, skipping foreign key constraint. Table will work without it.';
  END IF;
END $$;
