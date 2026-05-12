/**
 * Neptune 天气类 issue：仅 UnifiedExecutionSemanticView（不再消费 physical.weatherEvidence）。
 */
import { NeptuneStrategy } from './neptune-strategy.service';
import { buildTripExecutionSemanticViewSnapshot } from '../execution/trip-execution-semantic-view.builder';
import type { WorldModelContext } from '../shared/world-model.types';
import type { RoutePlanDraft } from '../shared/world-model.types';

const minimalPlan = (): RoutePlanDraft => ({
  tripId: 't-neptune-esv',
  routeDirectionId: 'rd',
  segments: [
    {
      segmentId: 'seg1',
      dayIndex: 1,
      distanceKm: 40,
      ascentM: 100,
      slopePct: 2,
      metadata: {},
    },
  ],
});

const basePhysical = {
  demEvidence: [],
  roadStates: [],
  hazardZones: [],
  ferryStates: [],
  countryCode: 'IS',
  month: 6,
};

describe('NeptuneStrategy executionSemanticView vs legacy weatherEvidence', () => {
  const invokeDetect = async (
    world: WorldModelContext,
    plan: RoutePlanDraft,
  ) => {
    const strategy = new NeptuneStrategy({} as any, {} as any);
    return (
      strategy as unknown as {
        detectAdditionalSpatialIssues(
          w: WorldModelContext,
          p: RoutePlanDraft,
        ): Promise<import('../interfaces/spatial-issue.interface').SpatialIssue[]>;
      }
    ).detectAdditionalSpatialIssues(world, plan);
  };

  it('uses executionSemanticView for HARD when present (empty weatherEvidence)', async () => {
    const execView = buildTripExecutionSemanticViewSnapshot({
      weatherByDate: {
        '2026-06-01': {
          violation: 'HARD',
          executionState: 'BLOCKED',
          explanation: 'unified semantic hard',
        },
      },
    });

    const world = {
      physical: {
        ...basePhysical,
        weatherEvidence: [],
      },
      human: {} as WorldModelContext['human'],
      routeDirection: { uuid: 'rd' } as WorldModelContext['routeDirection'],
      executionSemanticView: execView,
    } as WorldModelContext;

    const issues = await invokeDetect(world, minimalPlan());
    const wx = issues.find(i => i.issueId?.startsWith('weather_evidence_'));
    expect(wx).toBeDefined();
    expect(wx!.severity).toBe('HARD');
    expect(wx!.metadata?.source).toBe('UNIFIED_EXECUTION_SEMANTIC_VIEW');
    expect(wx!.metadata?.evidence_date).toBe('2026-06-01');
    expect(wx!.reason).toContain('unified semantic hard');
  });

  it('uses executionSemanticView SOFT tier when no HARD day', async () => {
    const execView = buildTripExecutionSemanticViewSnapshot({
      weatherByDate: {
        '2026-06-02': {
          executionState: 'HIGH_RISK',
          violation: 'NONE',
          explanation: 'semantic soft tier',
        },
      },
    });

    const world = {
      physical: {
        ...basePhysical,
        weatherEvidence: [
          {
            segmentId: 'legacy-seg',
            date: '2026-06-02',
            windSpeedMs: 20,
            precipitationMm: 0,
            violation: 'HARD',
            explanation: 'legacy should be ignored when view exists',
          },
        ],
      },
      human: {} as WorldModelContext['human'],
      routeDirection: { uuid: 'rd' } as WorldModelContext['routeDirection'],
      executionSemanticView: execView,
    } as WorldModelContext;

    const issues = await invokeDetect(world, minimalPlan());
    const soft = issues.find(i => i.issueId?.startsWith('weather_quality_'));
    expect(soft).toBeDefined();
    expect(soft!.severity).toBe('SOFT');
    expect(soft!.metadata?.source).toBe('UNIFIED_EXECUTION_SEMANTIC_VIEW');
    expect(soft!.reason).toContain('semantic soft tier');
  });

  it('does not emit weather issues from physical.weatherEvidence when Layer A is absent', async () => {
    const world = {
      physical: {
        ...basePhysical,
        weatherEvidence: [
          {
            segmentId: 'wx-seg',
            date: '2026-06-03',
            windSpeedMs: 25,
            precipitationMm: 40,
            violation: 'HARD',
            explanation: 'legacy must not drive Neptune',
          },
        ],
      },
      human: {} as WorldModelContext['human'],
      routeDirection: { uuid: 'rd' } as WorldModelContext['routeDirection'],
    } as WorldModelContext;

    const issues = await invokeDetect(world, minimalPlan());
    expect(
      issues.filter(i => i.issueId?.startsWith('weather_evidence_')),
    ).toHaveLength(0);
    expect(
      issues.filter(i => i.issueId?.startsWith('weather_quality_')),
    ).toHaveLength(0);
  });
});
