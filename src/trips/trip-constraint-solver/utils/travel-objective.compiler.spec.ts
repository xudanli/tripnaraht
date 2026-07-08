import {
  compileObjectiveWeights,
  inferDefaultRankedPrinciples,
  buildDefaultTravelObjectiveProfile,
} from './travel-objective.compiler';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../decision/optimization/objective-function.interface';

describe('travel-objective.compiler', () => {
  it('compileObjectiveWeights: higher-ranked principles dominate', () => {
    const safetyFirst = compileObjectiveWeights({
      rankedPrinciples: ['SAFETY', 'PACE', 'BUDGET'],
      version: 1,
    });
    const budgetFirst = compileObjectiveWeights({
      rankedPrinciples: ['BUDGET', 'SAFETY', 'PACE'],
      version: 1,
    });

    expect(safetyFirst.legacy.safety).toBeGreaterThan(budgetFirst.legacy.safety);
    expect(budgetFirst.legacy.budgetOverrun).toBeGreaterThan(safetyFirst.legacy.budgetOverrun);
  });

  it('compileObjectiveWeights: empty principles fall back to defaults', () => {
    const compiled = compileObjectiveWeights({ rankedPrinciples: [], version: 1 });
    expect(compiled.legacy).toEqual(DEFAULT_OBJECTIVE_WEIGHTS);
  });

  it('compileObjectiveWeights: produces normalized canonical weights', () => {
    const compiled = compileObjectiveWeights({
      rankedPrinciples: ['CORE_EXPERIENCE', 'COVERAGE', 'SAFETY'],
      version: 1,
    });
    const sum = Object.values(compiled.canonical).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(compiled.canonical.must_visit_poi_completion).toBeGreaterThan(0);
  });

  it('inferDefaultRankedPrinciples: conservative policy prioritizes safety and pace', () => {
    const principles = inferDefaultRankedPrinciples({ planningPolicy: 'CONSERVATIVE' });
    expect(principles[0]).toBe('SAFETY');
    expect(principles).toContain('PACE');
  });

  it('buildDefaultTravelObjectiveProfile: includes budget when configured', () => {
    const profile = buildDefaultTravelObjectiveProfile({ hasBudget: true });
    expect(profile.rankedPrinciples).toContain('BUDGET');
  });
});
