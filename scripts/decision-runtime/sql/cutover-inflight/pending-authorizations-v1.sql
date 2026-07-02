-- cutover-inflight: pending-authorizations-v1
-- Group: A — AUTHORIZED but not yet EFFECTIVE / high-risk awaiting execute
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' = 'AUTHORIZED'
  AND (rec->>'effectivePlanVersionId') IS NULL;
