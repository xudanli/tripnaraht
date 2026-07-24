-- cutover-inflight: orphan-authorizations-v1
-- Group: A — ledger records without matching decision run ref (heuristic)
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' IN ('AUTHORIZED', 'PROPOSED')
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(t.metadata->'rfc001DecisionRuns'->'items', '[]'::jsonb)
    ) AS run
    WHERE run->>'decisionId' = rec->>'decisionId'
  );
