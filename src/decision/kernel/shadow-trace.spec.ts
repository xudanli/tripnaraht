import { buildShadowDecisionTrace } from './shadow-trace';

describe('buildShadowDecisionTrace', () => {
  it('captures context, intervention mapping, trigger edges, and evidence signal ids', () => {
    const trace = buildShadowDecisionTrace({
      contextKey: 'IS:4:SUV',
      recentSignals: [
        { edgeId: 'e1', factor: 'water_crossing', direction: 'INCREASE', strength01: 0.9, reason: 'x' },
        { edgeId: 'e2', factor: 'wind', direction: 'INCREASE', strength01: 0.2, reason: 'y' },
      ],
      ambiguity: { gap01: 1, isRobustMode: true, isEmergency: true, reason: 'consensus' },
      failureDrivers: {
        alpha: 0.95,
        tailWeight: 0.2,
        tailCount: 3,
        topEdges: [{ edgeId: 'e1', contribution: 10 }],
        topFactors: [],
        bullets: ['bullet-a'],
      },
      intervention: {
        action: 'EMERGENCY_MELT_CUTOFF',
        mode: 'EMERGENCY',
        reasonCodes: ['X'],
        bullets: ['from-actuator'],
      },
      aggregate: {
        n: 10,
        expectedRiskCost: 1,
        cvarRiskCost: 2,
        alpha: 0.95,
        beta: 0.5,
        objective: 2,
        infeasibleWeight: 0,
      },
      alpha: 0.95,
      beta: 0.5,
      realtimeState: { at: '2026-01-01T00:00:00.000Z', lat: 1, lng: 2, delayMinutes: 40 },
    });

    expect(trace.schemaVersion).toBe(1);
    expect(trace.context.contextKey).toBe('IS:4:SUV');
    expect(trace.context.recentSignalCount).toBe(2);
    expect(trace.context.isEmergency).toBe(true);
    expect(trace.intervention.type).toBe('EMERGENCY_MELT');
    expect(trace.intervention.triggerEdges).toContain('e1');
    expect(trace.evidenceSignals[0]?.id).toContain('e1:water_crossing');
    expect(trace.evidenceSignals[0]?.weight).toBeCloseTo(0.9);
    expect(trace.realtimeState?.delayMinutes).toBe(40);
  });
});
