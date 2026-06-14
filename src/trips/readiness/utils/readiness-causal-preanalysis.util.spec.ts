import {
  applyCausalPreAnalysisToWorldState,
  buildReadinessCausalPreanalysis,
  buildReadinessCascadeUiHints,
  inferTriggerFromBlocker,
  mergeCausalPreAnalysisSnapshot,
} from './readiness-causal-preanalysis.util';
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
