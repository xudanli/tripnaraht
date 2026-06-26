-- Gate1 ↔ Decision Runtime dual-write staging reconciliation (read-only).
-- Run against staging only.

\echo '=== 1. Gate1 projects with linked Trip (required for dual-write) ==='
SELECT
  id AS project_id,
  title,
  linked_trip_id,
  experiment_status,
  cohort
FROM gate1_projects
WHERE linked_trip_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

\echo '=== 2. Gate1 projects missing linked Trip (events skipped) ==='
SELECT COUNT(*) AS projects_without_linked_trip
FROM gate1_projects
WHERE linked_trip_id IS NULL;

\echo '=== 3. Gate1 runtime event counts by type ==='
SELECT
  event_type,
  COUNT(*) AS cnt
FROM travel_events
WHERE source = 'gate1.runtime'
   OR event_type LIKE 'gate1.%'
GROUP BY event_type
ORDER BY cnt DESC;

\echo '=== 4. Decisions: Gate1 table vs Event Store ==='
SELECT
  p.id AS project_id,
  p.title,
  (SELECT COUNT(*) FROM gate1_advisor_decisions d WHERE d.project_id = p.id) AS gate1_decisions,
  (SELECT COUNT(*)
   FROM travel_events te
   WHERE te.trip_id = p.linked_trip_id
     AND te.event_type = 'gate1.decision.recorded') AS event_decisions
FROM gate1_projects p
WHERE p.linked_trip_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 20;

\echo '=== 5. Published conflicts: Gate1 vs Event Store ==='
SELECT
  p.id AS project_id,
  (SELECT COUNT(*)
   FROM gate1_conflict_reports r
   WHERE r.project_id = p.id AND r.status = 'PUBLISHED') AS gate1_published,
  (SELECT COUNT(*)
   FROM travel_events te
   WHERE te.trip_id = p.linked_trip_id
     AND te.event_type = 'gate1.conflict.detected') AS event_conflicts
FROM gate1_projects p
WHERE p.linked_trip_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 20;

\echo '=== 6. Published candidates: Gate1 vs Event Store ==='
SELECT
  p.id AS project_id,
  (SELECT COUNT(*)
   FROM gate1_candidate_strategies c
   WHERE c.project_id = p.id AND c.status = 'PUBLISHED') AS gate1_published,
  (SELECT COUNT(*)
   FROM travel_events te
   WHERE te.trip_id = p.linked_trip_id
     AND te.event_type = 'gate1.candidate_strategy.created') AS event_candidates
FROM gate1_projects p
WHERE p.linked_trip_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 20;

\echo '=== 7. Readiness open RED findings vs active blocker events ==='
SELECT
  p.id AS project_id,
  (SELECT COUNT(*)
   FROM gate1_readiness_findings f
   JOIN gate1_readiness_reports r ON r.id = f.report_id
   WHERE r.project_id = p.id AND f.status = 'RED' AND f.closed_at IS NULL) AS gate1_open_red,
  (SELECT COUNT(*)
   FROM travel_events te
   WHERE te.trip_id = p.linked_trip_id
     AND te.event_type = 'gate1.readiness.blocker_raised') -
  (SELECT COUNT(*)
   FROM travel_events te
   WHERE te.trip_id = p.linked_trip_id
     AND te.event_type = 'gate1.readiness.blocker_resolved') AS event_active_blockers
FROM gate1_projects p
WHERE p.linked_trip_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 20;

\echo '=== 7b. Runtime event outbox queue ==='
SELECT status, COUNT(*) AS cnt
FROM runtime_event_outbox
GROUP BY status
ORDER BY status;

\echo '=== 7c. linkedTripId coverage ==='
SELECT
  COUNT(*) AS total_projects,
  COUNT(*) FILTER (WHERE linked_trip_id IS NOT NULL) AS with_trip,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE linked_trip_id IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS coverage_pct
FROM gate1_projects;

\echo '=== 8. Orphan gate1 events (trip exists but no project link) ==='
SELECT te.trip_id, COUNT(*) AS event_count
FROM travel_events te
WHERE (te.source = 'gate1.runtime' OR te.event_type LIKE 'gate1.%')
  AND NOT EXISTS (
    SELECT 1 FROM gate1_projects p WHERE p.linked_trip_id = te.trip_id
  )
GROUP BY te.trip_id
ORDER BY event_count DESC
LIMIT 10;

\echo '=== 9. Recent gate1 runtime events sample ==='
SELECT
  te.trip_id,
  te.event_type,
  te.occurred_at,
  te.payload->>'gate1ProjectId' AS gate1_project_id,
  te.metadata->'runtime'->>'canonicalEventType' AS canonical_type
FROM travel_events te
WHERE te.source = 'gate1.runtime' OR te.event_type LIKE 'gate1.%'
ORDER BY te.occurred_at DESC
LIMIT 15;
