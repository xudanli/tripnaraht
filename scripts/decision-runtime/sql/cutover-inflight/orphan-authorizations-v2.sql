-- cutover-inflight: orphan-authorizations-v2
-- Orphan entries still executable (not reconciled INVALID_ORPHANED)
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' IN ('AUTHORIZED', 'PROPOSED')
  AND COALESCE(rec->'cutoverReconciliation'->>'status', '') NOT IN (
    'EXPIRED', 'INVALID_ORPHANED', 'CANCELLED_TEST_DATA', 'REQUIRES_REEVALUATION'
  )
  AND COALESCE((rec->'cutoverReconciliation'->>'executable')::boolean, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(t.metadata->'rfc001DecisionRuns'->'items', '[]'::jsonb)) run
    WHERE run->>'decisionId' = rec->>'decisionId'
  );
