import {
  resolveConstraintKeyForFeasibilityIssue,
  resolveConstraintKeyForSdrRule,
  validatorsForConstraintKey,
} from './constraint-validator-registry.util';

describe('constraint-validator-registry.util', () => {
  it('maps SDR-101 to MAX_DAILY_DRIVE', () => {
    expect(resolveConstraintKeyForSdrRule('SDR-101')).toBe('MAX_DAILY_DRIVE');
  });

  it('maps EXCESSIVE_DAILY_LOAD semantic key to MAX_DAILY_DRIVE', () => {
    expect(
      resolveConstraintKeyForFeasibilityIssue({
        semanticKey: 'EXCESSIVE_DAILY_LOAD',
      }),
    ).toBe('MAX_DAILY_DRIVE');
  });

  it('exposes validators for Phase 0 keys', () => {
    const validators = validatorsForConstraintKey('MAX_DAILY_DRIVE');
    expect(validators.some((v) => v.engine === 'FEASIBILITY')).toBe(true);
    expect(validators.some((v) => v.engine === 'TEP' && v.ruleId === 'SDR-101')).toBe(true);
  });
});
