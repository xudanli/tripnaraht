-- cutover-inflight: active-executions-v1
-- Group: A — EXECUTING decisions + PARTIAL/NEEDS_REPAIR unresolved
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' IN ('EXECUTING', 'PARTIAL', 'NEEDS_REPAIR');
