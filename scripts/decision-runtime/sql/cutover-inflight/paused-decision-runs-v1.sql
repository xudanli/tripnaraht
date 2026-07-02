-- cutover-inflight: paused-decision-runs-v1
-- Group: D — PAUSED runs (if your runtime persists PAUSED in metadata; adjust path if different)
-- Default: 0 when PAUSED is not persisted in rfc001 ledger
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionRuns'->'items', '[]'::jsonb)
) AS run
WHERE run->>'status' = 'PAUSED';
