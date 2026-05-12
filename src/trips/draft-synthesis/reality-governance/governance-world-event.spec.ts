import { createInitialGlobalWorldState, reduceGlobalWorldState } from '../autonomous-world';
import { buildGovernanceTickWorldBusEvent } from './governance-world-event';

describe('buildGovernanceTickWorldBusEvent', () => {
  it('computes maxPressure and folds into global city slice when cityKey set', () => {
    const ev = buildGovernanceTickWorldBusEvent({
      mode: 'FAIRNESS',
      cityKey: 'JP',
      timestamp: 9000,
      result: {
        outcomes: [],
        resourceSnapshots: {
          r1: { capacity: 10, currentLoad: 8 },
        },
      },
    });
    expect(ev.subType).toBe('GOVERNANCE_TICK');
    expect(ev.payload.maxPressure).toBeCloseTo(0.8);

    const next = reduceGlobalWorldState(createInitialGlobalWorldState(1), ev);
    expect(next.time).toBe(9000);
    expect(next.cities.JP.disruptionLevel).toBeGreaterThan(0);
    expect(next.cities.JP.congestion).toBeGreaterThan(0.3);
  });
});
