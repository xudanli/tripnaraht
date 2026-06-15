-- Travel Event Store staging verification (read-only checks).
-- Run against staging only. Do NOT run on production without approval.

\echo '=== 1. Table exists ==='
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'travel_events'
) AS travel_events_table_exists;

\echo '=== 2. Columns ==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'travel_events'
ORDER BY ordinal_position;

\echo '=== 3. Indexes ==='
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'travel_events'
ORDER BY indexname;

\echo '=== 4. Foreign key to Trip ==='
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.travel_events'::regclass
  AND contype = 'f';

\echo '=== 5. Row count (should be 0 before first enabled test) ==='
SELECT COUNT(*) AS travel_event_count FROM travel_events;

\echo '=== 6. Sample lifecycle events (after manual status-change test) ==='
SELECT id,
       trip_id,
       event_type,
       segment,
       occurred_at,
       actor_user_id,
       idempotency_key,
       payload
FROM travel_events
WHERE event_type = 'trip.lifecycle.state_changed'
ORDER BY occurred_at DESC
LIMIT 10;

\echo '=== 7. Duplicate idempotency keys (should return 0 rows) ==='
SELECT idempotency_key, COUNT(*) AS cnt
FROM travel_events
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
