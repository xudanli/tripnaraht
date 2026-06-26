import { validateOntologyRulesAgainstShapes } from './physical-constraint.shapes';

describe('physical-constraint.shapes', () => {
  it('passes valid ontology rules', () => {
    const violations = validateOntologyRulesAgainstShapes({
      roadAccess: { requires4x4: true },
      seasonality: { blockedMonths: [1, 2, 12] },
      openingHours: { closeAt: '22:00' },
    });
    expect(violations).toHaveLength(0);
  });

  it('flags invalid boolean and month values', () => {
    const violations = validateOntologyRulesAgainstShapes({
      roadAccess: { requires4x4: 'yes' },
      seasonality: { blockedMonths: [0, 13] },
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.path.includes('requires4x4'))).toBe(true);
  });
});
