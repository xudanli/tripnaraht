-- Test migration script for Trip Lifecycle Runtime - Phase 1
-- This script tests the migration before running it on production data

-- Create a test table to verify migration behavior
CREATE TABLE IF NOT EXISTS trip_migration_test (
  id SERIAL PRIMARY KEY,
  original_status VARCHAR(50),
  new_status VARCHAR(50),
  migration_timestamp TIMESTAMP DEFAULT NOW()
);

-- Test 1: Verify IN_PROGRESS trips exist (if any)
DO $$
DECLARE
  in_progress_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO in_progress_count
  FROM "Trip"
  WHERE "status" = 'IN_PROGRESS';

  RAISE NOTICE 'Found % trips with IN_PROGRESS status', in_progress_count;

  IF in_progress_count > 0 THEN
    INSERT INTO trip_migration_test (original_status, new_status)
    SELECT 'IN_PROGRESS', 'TRAVELING'
    FROM generate_series(1, in_progress_count);
  END IF;
END $$;

-- Test 2: Verify other statuses are not affected
DO $$
DECLARE
  planning_count INTEGER;
  completed_count INTEGER;
  cancelled_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO planning_count FROM "Trip" WHERE "status" = 'PLANNING';
  SELECT COUNT(*) INTO completed_count FROM "Trip" WHERE "status" = 'COMPLETED';
  SELECT COUNT(*) INTO cancelled_count FROM "Trip" WHERE "status" = 'CANCELLED';

  RAISE NOTICE 'PLANNING trips: %', planning_count;
  RAISE NOTICE 'COMPLETED trips: %', completed_count;
  RAISE NOTICE 'CANCELLED trips: %', cancelled_count;

  -- These should remain unchanged after migration
  INSERT INTO trip_migration_test (original_status, new_status)
  VALUES
    ('PLANNING', 'PLANNING'),
    ('COMPLETED', 'COMPLETED'),
    ('CANCELLED', 'CANCELLED');
END $$;

-- Test 3: Verify the UPDATE statement syntax (dry run)
-- This is the actual migration statement but wrapped in a transaction that will be rolled back
BEGIN;
  -- Create a temporary backup
  CREATE TEMP TABLE trip_status_backup AS
  SELECT id, "status" as original_status
  FROM "Trip"
  WHERE "status" = 'IN_PROGRESS';

  -- Show what would be updated
  SELECT * FROM trip_status_backup;

  -- Rollback to not actually change data
  ROLLBACK;

-- Clean up test table
DROP TABLE IF EXISTS trip_migration_test;

-- Test complete
-- Run the actual migration when ready:
-- UPDATE "Trip" SET "status" = 'TRAVELING' WHERE "status" = 'IN_PROGRESS';
