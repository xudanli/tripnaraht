import { ObjectiveSemanticsRegistry } from './objective-semantics.registry';
import { icelandMinimalPlan } from '../../decision-lab/fixtures/iceland-minimal.fixture';

describe('ObjectiveSemanticsRegistry', () => {
  it('evaluates 8 objectives for a minimal plan', () => {
    const registry = new ObjectiveSemanticsRegistry();
    const evaluations = registry.evaluatePlan({
      plan: icelandMinimalPlan(),
      utilityHint: 0.8,
    });
    expect(evaluations.length).toBe(9);
    expect(evaluations.find((e) => e.objectiveId === 'daily_driving_load')).toBeDefined();
    expect(evaluations.find((e) => e.objectiveId === 'must_visit_poi_completion')?.rawValue).toBeGreaterThanOrEqual(0);
  });
});
