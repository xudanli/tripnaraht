import {
  resolveResumeStageWithArtifacts,
  shouldReSubmitAuthority,
  isTerminalInstanceStatus,
  isClaimableStatus,
} from './benchmark-resume.util';

describe('benchmark-resume.util', () => {
  describe('resolveResumeStageWithArtifacts', () => {
    it('does not re-submit authority when artifact exists', () => {
      const stage = resolveResumeStageWithArtifacts({
        status: 'RUNNING',
        hasAuthorityResponse: true,
        hasShadowEvent: false,
        hasReviewCase: false,
      });
      expect(stage).toBe('WAIT_SHADOW');
      expect(shouldReSubmitAuthority(stage, true)).toBe(false);
    });

    it('resumes materialize after shadow artifact', () => {
      expect(
        resolveResumeStageWithArtifacts({
          status: 'AUTHORITY_COMPLETED',
          hasAuthorityResponse: true,
          hasShadowEvent: true,
          hasReviewCase: false,
        }),
      ).toBe('MATERIALIZE');
    });

    it('finalizes when review case exists', () => {
      expect(
        resolveResumeStageWithArtifacts({
          status: 'SHADOW_COMPLETED',
          hasAuthorityResponse: true,
          hasShadowEvent: true,
          hasReviewCase: true,
        }),
      ).toBe('FINALIZE');
    });

    it('skips terminal statuses', () => {
      for (const status of ['COMPLETED', 'EXCLUDED', 'TERMINAL_FAILED'] as const) {
        expect(
          resolveResumeStageWithArtifacts({
            status,
            hasAuthorityResponse: false,
            hasShadowEvent: false,
            hasReviewCase: false,
          }),
        ).toBe('SKIP_TERMINAL');
      }
    });

    it('RETRYABLE_FAILED with authority waits for shadow', () => {
      expect(
        resolveResumeStageWithArtifacts({
          status: 'RETRYABLE_FAILED',
          hasAuthorityResponse: true,
          hasShadowEvent: false,
          hasReviewCase: false,
        }),
      ).toBe('WAIT_SHADOW');
    });
  });

  describe('isClaimableStatus', () => {
    it('allows reclaim when RUNNING lease expired', () => {
      const expired = new Date(Date.now() - 1000).toISOString();
      expect(isClaimableStatus('RUNNING', expired)).toBe(true);
    });

    it('blocks reclaim when RUNNING lease active', () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(isClaimableStatus('RUNNING', future)).toBe(false);
    });
  });

  describe('isTerminalInstanceStatus', () => {
    it('marks completed and failed as terminal', () => {
      expect(isTerminalInstanceStatus('COMPLETED')).toBe(true);
      expect(isTerminalInstanceStatus('PENDING')).toBe(false);
    });
  });
});
