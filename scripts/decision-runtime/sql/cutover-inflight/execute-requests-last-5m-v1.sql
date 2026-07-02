-- cutover-inflight: execute-requests-last-5m-v1
-- Group: C — execution ledger keys written in last 5 minutes
SELECT count(*) AS value
FROM "Trip" t
WHERE t.metadata->'rfc001PlanVersionExecutions' IS NOT NULL
  AND (
    t.metadata->'rfc001PlanVersions'->>'lastUpdatedAt'
  )::timestamptz >= NOW() - INTERVAL '5 minutes';
