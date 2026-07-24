import type { TravelContextSnapshot } from '../../../../travel-context/domain/travel-context.types';
import { TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../../../travel-context/domain/travel-context.constants';

/** Planning-stage Iceland fixture for projection / assembly harness (H-P0). */
export function buildIcelandPlanningContextFixture(
  overrides?: Partial<TravelContextSnapshot>,
): TravelContextSnapshot {
  const contextId = 'fixture-iceland-planning-v1';
  const revision = 1_720_000_000_000;

  const base: TravelContextSnapshot = {
    schemaId: TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID,
    identity: {
      contextId,
      stage: 'PLANNING',
      scenarioId: contextId,
      tripId: 'trip_iceland_fixture',
      ownerUserId: 'user_fixture',
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    meta: {
      snapshotId: `tctx_${contextId}_${revision}`,
      revision,
      generatedAt: '2026-07-05T10:00:00.000Z',
      consistency: 'STRONG',
      bindings: {
        constraintsVersion: 2,
        effectivePlanVersionId: 'pv_fixture_1',
        worldStateVersion: 'ws_fixture_1',
      },
    },
    intent: {
      primaryGoal: '冰岛南岸不赶路自驾',
      destination: { status: 'CONFIRMED', countryCode: 'IS', label: 'Iceland' },
      dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
      rankedPrinciples: ['LOW_DRIVING'],
    },
    participants: {
      count: 2,
      publicSummary: [{ memberId: 'm1', role: 'OWNER' }],
      preferenceCoverage: { mobility: 'PARTIAL', privateWishes: 'MISSING' },
    },
    contract: {
      constraints: [],
      conflictSummary: { count: 1, blockingCount: 0 },
    },
    plan: {
      effectivePlan: {
        versionId: 'pv_fixture_1',
        dayCount: 5,
        itemCount: 12,
        hasEffectivePlan: true,
        executabilityStatus: 'EXECUTABLE',
      },
      selectedRouteId: 'route_fixture_a',
    },
    world: { facts: [], dataCompletenessScore: 0.75 },
    decisions: {
      open: [
        {
          decisionId: 'prob_1',
          problemType: 'ROAD_CONDITION',
          title: 'F208 可能关闭',
          urgency: 'MEDIUM',
          status: 'WAITING_USER',
          authorizationRequired: true,
        },
        {
          decisionId: 'prob_2',
          problemType: 'PACE',
          title: 'Day 3 负荷偏高',
          urgency: 'LOW',
          status: 'DETECTED',
          authorizationRequired: false,
        },
      ],
      counts: { total: 2, blocking: 0, actionable: 2 },
    },
    monitoring: {
      activeCount: 1,
      items: [
        {
          itemId: 'mon_1',
          kind: 'road_status',
          status: 'ACTIVE',
          headline: 'F208 开放状态',
        },
      ],
      paused: false,
    },
    history: { recent: [] },
  };

  return overrides ? { ...base, ...overrides } : base;
}
