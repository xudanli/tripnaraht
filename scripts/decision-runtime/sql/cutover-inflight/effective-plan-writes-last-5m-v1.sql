-- cutover-inflight: effective-plan-writes-last-5m-v1
-- Group: C — effective switch in last 5 minutes
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001PlanVersions'->'items', '[]'::jsonb)
) AS pv
WHERE pv->>'status' = 'EFFECTIVE'
  AND (pv->>'effectiveAt')::timestamptz >= NOW() - INTERVAL '5 minutes';
