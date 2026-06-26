import {
  isNlPhase1ConfirmText,
  reconcileInferredFieldsFromUserInput,
} from './nl-inferred-reconciliation.util';

describe('nl-inferred-reconciliation', () => {
  it('clears inferred fields when values are explicit', () => {
    const out = reconcileInferredFieldsFromUserInput({
      startDate: '2026-07-01',
      endDate: '2026-07-08',
      totalBudget: 30000,
      inferredFields: ['startDate', 'endDate', 'totalBudget'],
    });
    expect(out.inferredFields).toBeUndefined();
  });

  it('sets confirmInferred on NL confirm phrases', () => {
    const out = reconcileInferredFieldsFromUserInput(
      { inferredFields: ['totalBudget'], totalBudget: 20000 },
      '确认无误',
    );
    expect(out.confirmInferred).toBe('confirm');
    expect(out.inferredFields).toBeUndefined();
  });

  it('detects common confirm text', () => {
    expect(isNlPhase1ConfirmText('确认无误')).toBe(true);
    expect(isNlPhase1ConfirmText('预算没问题')).toBe(true);
    expect(isNlPhase1ConfirmText('我想去冰岛玩十天')).toBe(false);
  });
});
