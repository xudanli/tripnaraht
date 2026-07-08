import type { TravelContextSnapshot } from '../../../../travel-context/domain/travel-context.types';
import { buildIcelandPlanningContextFixture } from './iceland-planning.fixture';

/** Iceland south-coast ready fixture for REPLAN-ROAD-CLOSURE-001 (RFC-003 §9.7). */
export function buildIcelandRoadClosureReadyFixture(
  overrides?: Partial<TravelContextSnapshot>,
): TravelContextSnapshot {
  const baseRevision = 1_720_000_027_000;

  return buildIcelandPlanningContextFixture({
    meta: {
      ...buildIcelandPlanningContextFixture().meta,
      revision: baseRevision,
      snapshotId: `tctx_fixture-iceland-planning-v1_${baseRevision}`,
      bindings: {
        constraintsVersion: 3,
        effectivePlanVersionId: 'pv_iceland_v3',
        worldStateVersion: 'ws_iceland_v3',
      },
    },
    plan: {
      effectivePlan: {
        versionId: 'pv_iceland_v3',
        dayCount: 5,
        itemCount: 14,
        hasEffectivePlan: true,
        executabilityStatus: 'EXECUTABLE',
      },
      selectedRouteId: 'route_south_coast_v3',
    },
    contract: {
      constraints: [
        {
          id: 'c_low_driving',
          level: 'STRONG_PREFERENCE',
          source: 'USER_EXPLICIT',
          confidence: 1,
          editable: true,
          overridable: false,
          label: '少开车',
          domain: 'pace',
        },
      ],
      conflictSummary: { count: 0, blockingCount: 0 },
    },
    ...overrides,
  });
}

/** Alias used by replan specs */
export const buildIcelandPlanningContextFixtureForReplan = buildIcelandRoadClosureReadyFixture;
