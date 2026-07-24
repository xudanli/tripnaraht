import { BadRequestException } from '@nestjs/common';
import { validateConsumerPrincipleSelections } from './validate-consumer-principles.util';

describe('validateConsumerPrincipleSelections', () => {
  it('allows empty when allowEmpty', () => {
    expect(() => validateConsumerPrincipleSelections([], { allowEmpty: true })).not.toThrow();
  });

  it('rejects empty without allowEmpty', () => {
    expect(() => validateConsumerPrincipleSelections([])).toThrow(BadRequestException);
  });

  it('rejects more than 3 principles', () => {
    expect(() =>
      validateConsumerPrincipleSelections([
        { principleId: 'LOW_DRIVING', rank: 1 },
        { principleId: 'STAY_STABILITY', rank: 2 },
        { principleId: 'NO_NIGHT_DRIVING', rank: 3 },
        { principleId: 'BUDGET_FLEXIBLE', rank: 4 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate principleId', () => {
    expect(() =>
      validateConsumerPrincipleSelections([
        { principleId: 'LOW_DRIVING', rank: 1 },
        { principleId: 'LOW_DRIVING', rank: 2 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects non-consecutive ranks', () => {
    expect(() =>
      validateConsumerPrincipleSelections([
        { principleId: 'LOW_DRIVING', rank: 1 },
        { principleId: 'STAY_STABILITY', rank: 3 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('accepts valid 1–3 selections', () => {
    expect(() =>
      validateConsumerPrincipleSelections([
        { principleId: 'CORE_EXPERIENCE_FIRST', rank: 1 },
        { principleId: 'LOW_DRIVING', rank: 2 },
      ]),
    ).not.toThrow();
  });
});
