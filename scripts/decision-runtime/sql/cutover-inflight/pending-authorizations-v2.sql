-- cutover-inflight: pending-authorizations-v2
-- Executable AUTHORIZED only — excludes reconciled EXPIRED / non-executable
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' = 'AUTHORIZED'
  AND (rec->>'effectivePlanVersionId') IS NULL
  AND COALESCE((rec->'cutoverReconciliation'->>'executable')::boolean, true) = true
  AND COALESCE(rec->'cutoverReconciliation'->>'status', '') NOT IN (
    'EXPIRED', 'INVALID_ORPHANED', 'CANCELLED_TEST_DATA', 'REQUIRES_REEVALUATION'
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(t.metadata->'rfc001DecisionRuns'->'items', '[]'::jsonb)) run
    WHERE run->>'decisionId' = rec->>'decisionId'
  );
