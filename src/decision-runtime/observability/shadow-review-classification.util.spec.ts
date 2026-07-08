import { deriveReviewClassification } from './shadow-review-classification.util';

describe('deriveReviewClassification', () => {
  const lexIsA = {
    optionAIs: 'SHADOW' as const,
    optionBIs: 'AUTHORITY' as const,
  };
  const lexIsB = {
    optionAIs: 'AUTHORITY' as const,
    optionBIs: 'SHADOW' as const,
  };

  it('maps A to LEX when shadow is A', () => {
    expect(
      deriveReviewClassification({ preferredOption: 'A', blindMapping: lexIsA }),
    ).toBe('LEX_BETTER');
  });

  it('maps A to LEGACY when authority is A', () => {
    expect(
      deriveReviewClassification({ preferredOption: 'A', blindMapping: lexIsB }),
    ).toBe('LEGACY_BETTER');
  });

  it('passes through non-pick verdicts', () => {
    expect(
      deriveReviewClassification({ preferredOption: 'EQUIVALENT', blindMapping: lexIsA }),
    ).toBe('EQUIVALENT');
  });
});
