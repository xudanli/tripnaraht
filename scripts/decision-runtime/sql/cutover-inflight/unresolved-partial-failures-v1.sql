-- cutover-inflight: unresolved-partial-failures-v1
-- Group: A — cannot overlay-force zero when > 0
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' IN ('PARTIAL', 'FAILED', 'NEEDS_REPAIR');
