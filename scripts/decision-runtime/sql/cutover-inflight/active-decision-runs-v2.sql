-- cutover-inflight: active-decision-runs-v2
-- Truly active only: EXECUTING or execution lock, excluding reconciled non-executable
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE (
    rec->>'recordStatus' = 'EXECUTING'
    OR (t.metadata->'rfc001ExecutionLocks' ? (rec->>'decisionId'))
  )
  AND COALESCE((rec->'cutoverReconciliation'->>'executable')::boolean, true) = true
  AND rec->>'recordStatus' NOT IN ('EFFECTIVE', 'FAILED', 'ROLLED_BACK', 'REJECTED_BY_USER');
