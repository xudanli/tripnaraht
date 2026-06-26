import {
  applyCausalPreAnalysisToWorldState,
  buildReadinessCausalPreanalysis,
  buildReadinessCascadeUiHints,
  buildCausalPreanalysisForTopBlocker,
  inferTriggerFromBlocker,
  mergeCausalPreAnalysisSnapshot,
  resolveCausalPreanalysisTrigger,
} from './readiness-causal-preanalysis.util';
import { ViolationCode } from '../../../domain/ontology/validator/physical-validator.constants';
import type { ReadinessScoreFinding } from '../types/coverage-map.types';

describe('readiness-causal-preanalysis', () => {
  const transportBlocker: ReadinessScoreFinding = {
    id: 'b-road-1',
    type: 'blocker',
    category: 'transport',
    message: 'F-road F208 可能封路，高地段不可通行',
    severity: 'high',
  };

  const itineraryItems = [
    {
      id: 'd1',
      type: 'DRIVE',
      startTime: '2026-07-01T09:00:00.000Z',
      dayDate: '2026-07-01',
      metadata: { isFroad: true },
    },
    {
      id: 'p1',
      type: 'ACTIVITY',
      startTime: '2026-07-01T14:00:00.000Z',
      dayDate: '2026-07-01',
      placeName: 'Landmannalaugar',
      metadata: { indoorOutdoor: 'outdoor' },
    },
  ];

  it('infers ROAD trigger from F-road blocker', () => {
    const trigger = inferTriggerFromBlocker(transportBlocker);
    expect(trigger?.factType).toBe('ROAD');
    expect((trigger?.value as any)?.metadata?.isFroad).toBe(true);
  });

  it('prefers physical violation bridge over blocker text heuristic', () => {
    const trigger = resolveCausalPreanalysisTrigger({
      physicalViolations: [
        {
          code: ViolationCode.SEGMENT_ROAD_CLOSED,
          severity: 'BLOCK',
          detail: 'F-road F208 closed',
        },
      ],
      physicalContext: { evaluatedAt: '2026-07-01T09:00:00.000Z', segmentId: 'seg-f208' },
      blocker: {
        id: 'generic-blocker',
        type: 'blocker',
        category: 'schedule',
        message: 'schedule too tight',
        severity: 'medium',
      },
    });

    expect(trigger?.factType).toBe('ROAD');
    expect(trigger?.source).toBe('physical_validator');
    expect(trigger?.entityRef.id).toBe('seg-f208');
  });

  it('builds preanalysis from physical violations without blocker text', () => {
    const result = buildReadinessCausalPreanalysis({
      tripId: 'trip-1',
      physicalViolations: [
        {
          code: ViolationCode.SEGMENT_SEASONALLY_CLOSED,
          severity: 'BLOCK',
          detail: 'F-road F208 seasonal closure',
        },
      ],
      physicalContext: { evaluatedAt: '2026-07-01T09:00:00.000Z' },
      itineraryItems,
    });

    expect(result).not.toBeNull();
    expect(result!.trigger.source).toBe('physical_validator');
    expect(result!.impact.affected.length).toBeGreaterThan(0);
    expect(result!.impact.affected[0].cascadeConfidence).toBeDefined();
  });

  it('buildCausalPreanalysisForTopBlocker works with physical snapshot only', () => {
    const result = buildCausalPreanalysisForTopBlocker({
      tripId: 'trip-1',
      findings: [],
      itineraryItems,
      physicalViolations: [
        {
          code: ViolationCode.SEGMENT_ROAD_CLOSED,
          severity: 'BLOCK',
          detail: 'F-road F208 closed',
        },
      ],
      physicalContext: { segmentId: 'seg-f208', evaluatedAt: '2026-07-01T09:00:00.000Z' },
    });
    expect(result).not.toBeNull();
    expect(result!.trigger.source).toBe('physical_validator');
  });

  it('builds preanalysis with downstream affected nodes', () => {
    const result = buildReadinessCausalPreanalysis({
      tripId: 'trip-1',
      blocker: transportBlocker,
      itineraryItems,
    });

    expect(result).not.toBeNull();
    expect(result!.impact.affected.length).toBeGreaterThan(0);
    expect(result!.coverage.summary).toMatch(/未检查/);
  });

  it('merges snapshot into trip metadata', () => {
    const result = buildReadinessCausalPreanalysis({
      tripId: 'trip-1',
      blocker: transportBlocker,
      itineraryItems,
    });
    expect(result).not.toBeNull();

    const merged = mergeCausalPreAnalysisSnapshot({}, { result: result!, blockerId: 'b-road-1' });
    const snap = (merged as Record<string, unknown>).readinessCausalPreAnalysis as any;
    expect(snap.latest.tripId).toBe('trip-1');
    expect(snap.byBlockerId['b-road-1']).toBeDefined();
  });

  it('builds cascade UI hints from preanalysis', () => {
    const result = buildReadinessCausalPreanalysis({
      tripId: 'trip-1',
      blocker: transportBlocker,
      itineraryItems,
    });
    const hints = buildReadinessCascadeUiHints(result);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0].riskLevel).toBeDefined();
    expect(hints[0].triggerFactType).toBe('ROAD');
    expect(hints[0].triggerSource).toBe('readiness_blocker');
    expect(hints[0].cascadeConfidence).toBeGreaterThan(0);
    expect(hints[0].propagationHop).toBeGreaterThanOrEqual(0);
  });

  it('applies alerts to world state signals', () => {
    const pre = buildReadinessCausalPreanalysis({
      tripId: 'trip-1',
      blocker: transportBlocker,
      itineraryItems,
    });
    expect(pre).not.toBeNull();

    const state = {
      context: { destination: 'Iceland', startDate: '2026-07-01', endDate: '2026-07-05', timezone: 'Atlantic/Reykjavik', party: { count: 2 } },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
      policies: {},
    } as any;

    applyCausalPreAnalysisToWorldState(state, pre!);
    expect(state.signals.alerts?.length).toBeGreaterThan(0);
    expect(state.signals.alerts?.[0].message).toMatch(/级联/);
  });
});
