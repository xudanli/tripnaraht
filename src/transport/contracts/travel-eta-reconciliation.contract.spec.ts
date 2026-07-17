import {
  attachActualDuration,
  buildPlanningReconciliationEvent,
  computeReconciliationMetrics,
} from './travel-eta-reconciliation.contract';
import { projectLegacyDurationToEtaEnvelope, applyPlanningAdjustments } from './travel-eta.contract';

describe('travel-eta-reconciliation', () => {
  it('builds planning shadow event and attaches actual with errors', () => {
    const base = projectLegacyDurationToEtaEnvelope({
      durationMin: 120,
      sourceKind: 'ROUTE_API',
      provider: 'MAPBOX',
    });
    const eta = applyPlanningAdjustments(
      base,
      [
        { reason: 'F_ROAD', deltaMin: 30 },
        { reason: 'SEASONAL_UNCERTAINTY', deltaMin: 5 },
      ],
      { authority: 'SHADOW' },
    );

    const planning = buildPlanningReconciliationEvent({
      eta,
      tripId: 't1',
      fromItemId: 'a',
      toItemId: 'b',
      decision: 'ALLOW',
    });
    expect(planning.phase).toBe('PLANNING_SHADOW');
    expect(planning.baseDurationMin).toBe(120);
    expect(planning.planningDurationMin).toBe(155);
    expect(planning.segmentKey).toBe('a->b');

    const actual = attachActualDuration(planning, 149);
    expect(actual.phase).toBe('ACTUAL');
    expect(actual.baseErrorMin).toBe(29);
    expect(actual.planningErrorMin).toBe(-6);
    expect(actual.bufferHit).toBe(true);
    expect(actual.overBuffered).toBe(true);
    expect(actual.underBuffered).toBe(false);
  });

  it('computes MAE and provider known rate', () => {
    const base = projectLegacyDurationToEtaEnvelope({
      durationMin: 100,
      provider: 'GOOGLE',
      sourceKind: 'ROUTE_API',
    });
    const e1 = attachActualDuration(
      buildPlanningReconciliationEvent({ eta: base, tripId: 't' }),
      110,
    );
    const unknown = projectLegacyDurationToEtaEnvelope({
      durationMin: 100,
      provider: 'UNKNOWN',
      sourceKind: 'ROUTE_API',
    });
    const e2 = buildPlanningReconciliationEvent({ eta: unknown });

    const m = computeReconciliationMetrics([e1, e2]);
    expect(m.withActualCount).toBe(1);
    expect(m.baseMaeMin).toBe(10);
    expect(m.providerKnownRate).toBe(0.5);
  });
});
