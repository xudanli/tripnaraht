import {
  resolveCgusRagEvidenceEnabled,
  isKernelCgusRagEvidenceEnabledFromEnv,
} from './kernel-cgus-rag.constants';

describe('kernel-cgus-rag.constants', () => {
  it('resolveCgusRagEvidenceEnabled respects config override', () => {
    expect(resolveCgusRagEvidenceEnabled({ configEnabled: true })).toBe(true);
    expect(resolveCgusRagEvidenceEnabled({ configEnabled: false })).toBe(false);
  });

  it('defaults to true on staging/production when no explicit flag', () => {
    expect(
      resolveCgusRagEvidenceEnabled({
        env: { NODE_ENV: 'staging' } as NodeJS.ProcessEnv,
      }),
    ).toBe(true);
    expect(
      resolveCgusRagEvidenceEnabled({
        env: { NODE_ENV: 'development' } as NodeJS.ProcessEnv,
      }),
    ).toBe(false);
  });

  it('DECISION_OS_RAG_EVIDENCE_ENABLED and legacy KERNEL env override defaults', () => {
    expect(
      resolveCgusRagEvidenceEnabled({
        env: {
          NODE_ENV: 'development',
          DECISION_OS_RAG_EVIDENCE_ENABLED: 'true',
        } as NodeJS.ProcessEnv,
      }),
    ).toBe(true);
    expect(isKernelCgusRagEvidenceEnabledFromEnv({ KERNEL_CGUS_RAG_EVIDENCE: 'yes' } as any)).toBe(
      true,
    );
  });
});
