-- cutover-inflight: expired-but-executable-authorizations-v1
-- Group: A — AUTHORIZED with expired auth window still consumable (adjust field names to your auth TTL schema)
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' = 'AUTHORIZED'
  AND rec->'authorizationRequirement'->>'expiresAt' IS NOT NULL
  AND (rec->'authorizationRequirement'->>'expiresAt')::timestamptz < NOW()
  AND (rec->>'effectivePlanVersionId') IS NULL;
