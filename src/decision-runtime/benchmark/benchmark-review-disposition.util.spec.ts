import {
  deriveReviewDisposition,
  isMaterializeExclusionSkipReason,
  resolveMaterializeSkipReason,
} from './benchmark-review-disposition.util';

describe('benchmark-review-disposition.util', () => {
  describe('isMaterializeExclusionSkipReason', () => {
    it.each([
      'SAME_WINNER',
      'MISSING_WINNER',
      'ALL_INFEASIBLE',
      'SHADOW_NOT_SUCCESSFUL',
    ])('treats %s as exclusion skip', (reason) => {
      expect(isMaterializeExclusionSkipReason(reason)).toBe(true);
    });

    it('rejects unknown skip reasons', () => {
      expect(isMaterializeExclusionSkipReason('TRANSIENT_ERROR')).toBe(false);
    });
  });

  describe('resolveMaterializeSkipReason', () => {
    it('returns skip reason for matching comparisonId', () => {
      expect(
        resolveMaterializeSkipReason(
          {
            skipped: [{ comparisonId: 'cmp_1', reason: 'MISSING_WINNER' }],
          },
          'cmp_1',
        ),
      ).toBe('MISSING_WINNER');
    });
  });

  describe('deriveReviewDisposition', () => {
    it('returns EXCLUDED when exclusionReason is set', () => {
      expect(
        deriveReviewDisposition({
          status: 'COMPLETED',
          exclusionReason: 'MISSING_WINNER',
          reviewCaseId: undefined,
          eligibleForStrategyComparison: true,
        }),
      ).toBe('EXCLUDED');
    });
  });
});
