-- cutover-inflight: plan-versions-created-last-5m-v1
-- Group: C — maintenance silence window
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001PlanVersions'->'items', '[]'::jsonb)
) AS pv
WHERE (pv->>'createdAt')::timestamptz >= NOW() - INTERVAL '5 minutes';
