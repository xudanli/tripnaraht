import type { TravelContextSnapshot } from '../domain/travel-context.types';
import { projectExplorationView } from './exploration.projection';

export interface ExplorationProjectionAssertion {
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

function assertExploration(input: {
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
}): ExplorationProjectionAssertion {
  return {
    name: input.name,
    pass: input.pass,
    expected: input.expected,
    actual: input.actual,
    message: input.pass ? undefined : `Assertion failed: ${input.name}`,
  };
}

/** EXPLORATION-PROJECTION-001 — exploration view aligns with snapshot SSOT (Phase 1). */
export function assertExplorationProjectionConsistency(
  snapshot: TravelContextSnapshot,
): ExplorationProjectionAssertion[] {
  const view = projectExplorationView(snapshot);
  const archive = snapshot.history.explorationArchive;
  const candidatesStatus = view.candidatesStatus as { selectedRouteId?: string | null };
  const explorationArchiveView = view.explorationArchive as
    | { rejectedRouteIds?: string[] }
    | undefined;

  return [
    assertExploration({
      name: 'exploration_view_revision_matches_snapshot',
      pass: view.revision === snapshot.meta.revision,
      expected: snapshot.meta.revision,
      actual: view.revision,
    }),
    assertExploration({
      name: 'exploration_view_stage_matches_identity',
      pass: view.stage === snapshot.identity.stage,
      expected: snapshot.identity.stage,
      actual: view.stage,
    }),
    assertExploration({
      name: 'exploration_view_scenario_id_matches_context',
      pass: view.scenarioId === snapshot.identity.contextId,
      expected: snapshot.identity.contextId,
      actual: view.scenarioId,
    }),
    assertExploration({
      name: 'exploration_selected_route_matches_plan',
      pass: candidatesStatus.selectedRouteId === snapshot.plan.selectedRouteId,
      expected: snapshot.plan.selectedRouteId,
      actual: candidatesStatus.selectedRouteId,
    }),
    assertExploration({
      name: 'exploration_archive_rejected_routes_match',
      pass:
        JSON.stringify(explorationArchiveView?.rejectedRouteIds ?? []) ===
        JSON.stringify(archive?.rejectedRouteIds ?? []),
      expected: archive?.rejectedRouteIds ?? [],
      actual: explorationArchiveView?.rejectedRouteIds ?? [],
    }),
    assertExploration({
      name: 'exploration_view_has_no_poi_geojson',
      pass: !containsHeavyGeoPayload(view),
      expected: 'refs only',
      actual: 'clean',
    }),
  ];
}

function containsHeavyGeoPayload(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some((item) => containsHeavyGeoPayload(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  if (record.type === 'FeatureCollection' || record.coordinates !== undefined) {
    return true;
  }
  if (typeof record.geojson === 'object' && record.geojson !== null) {
    return true;
  }

  return Object.values(record).some((v) => containsHeavyGeoPayload(v, depth + 1));
}
