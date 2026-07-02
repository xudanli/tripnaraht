-- cutover-inflight: active-rollbacks-v1
-- Group: A — itinerary revision rollback hops not yet settled
SELECT count(*) AS value
FROM itinerary_revisions
WHERE kind = 'ROLLBACK'
  AND created_at >= NOW() - INTERVAL '24 hours';
