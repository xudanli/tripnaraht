import {
  applyLocalConstraints,
  detectEmergence,
  detectStableFlows,
  noDecision,
  relaxTowardsConstraints,
  step,
} from './index';
import type { PostSystemField } from './post-system-field.types';

function unitField(agents: PostSystemField['agents']): PostSystemField {
  return {
    agents,
    environment: {
      tick: 0,
      bounds: { min: [0, 0], max: [10, 10] },
    },
    constraintField: {
      relaxationRate: 0.35,
      maxDisplacementPerStep: 2,
    },
    emergencePatterns: [],
  };
}

describe('post-system (P25)', () => {
  it('noDecision is undefined — decision machinery is not invoked', () => {
    expect(noDecision()).toBeUndefined();
  });

  it('step advances tick and relaxes agents toward constraint manifold', () => {
    const field = unitField([
      { id: 'a', position: [9, 9], stress: 1 },
      { id: 'b', position: [1, 1], stress: 1 },
    ]);
    const next = step(field);
    expect(next.environment.tick).toBe(1);
    expect(next.agents[0].position[0]).toBeLessThan(9);
    expect(next.agents[1].position[0]).toBeGreaterThan(1);
  });

  it('detectEmergence surfaces natural_policy when flows are self-maintaining', () => {
    const centerField = unitField([
      { id: 'a', position: [5, 5], stress: 0.05 },
      { id: 'b', position: [5.02, 4.98], stress: 0.04 },
    ]);
    const relaxed = relaxTowardsConstraints(applyLocalConstraints(centerField));
    const patterns = detectEmergence({ ...centerField, agents: relaxed });
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    expect(patterns[0]?.type).toBe('natural_policy');
    expect(patterns[0]?.stability).toBeGreaterThan(0.5);
  });

  it('detectStableFlows marks low-stress cohesive clusters as self-maintaining', () => {
    const flows = detectStableFlows([
      { id: 'x', position: [5, 5], stress: 0.05 },
      { id: 'y', position: [5.01, 5.02], stress: 0.06 },
    ]);
    expect(flows[0]?.selfMaintaining).toBe(true);
  });
});
