import {
  KERNEL_CGUS_RAG_EVIDENCE_ENV,
  isKernelCgusRagEvidenceEnabledFromEnv,
} from './kernel-cgus-rag.constants';

describe('isKernelCgusRagEvidenceEnabledFromEnv', () => {
  it('respects injected env object', () => {
    expect(isKernelCgusRagEvidenceEnabledFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isKernelCgusRagEvidenceEnabledFromEnv({
        [KERNEL_CGUS_RAG_EVIDENCE_ENV]: 'TRUE',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
