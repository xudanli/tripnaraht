-- cutover-inflight: active-decision-runs-v1
-- Group: A — RFC001 decision records in active execution states (trip.metadata)
-- Maps canonical DISPATCHING/EVALUATING/FINALIZING/AUTHORIZING/EXECUTING → recordStatus EXECUTING + PROPOSED in-flight
SELECT count(*) AS value
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
WHERE rec->>'recordStatus' IN ('EXECUTING', 'PROPOSED')
  AND (
    rec->>'recordStatus' = 'EXECUTING'
    OR (rec->>'recordStatus' = 'PROPOSED' AND (rec->'authorizationRequirement'->>'level') IS NOT NULL)
  );
