import { detectArtifactHashMismatch, detectEvidenceGap } from './benchmark-evidence.util';

describe('benchmark-evidence.util', () => {
  it('detects DB-ahead authority gap', () => {
    const gap = detectEvidenceGap({
      status: 'AUTHORITY_COMPLETED',
      authorityResponseHash: 'abc',
      hasAuthorityFile: false,
      hasShadowFile: false,
      hasMaterializeFile: false,
    });
    expect(gap?.code).toBe('EVIDENCE_INCOMPLETE_AUTHORITY');
  });

  it('detects DB-ahead shadow gap', () => {
    const gap = detectEvidenceGap({
      status: 'SHADOW_COMPLETED',
      hasAuthorityFile: true,
      comparisonId: 'cmp-1',
      hasShadowFile: false,
      hasMaterializeFile: false,
    });
    expect(gap?.code).toBe('EVIDENCE_INCOMPLETE_SHADOW');
  });

  it('detects artifact hash mismatch', () => {
    const gap = detectArtifactHashMismatch({
      storedHash: 'aaa',
      fileHash: 'bbb',
      label: 'authority-response',
    });
    expect(gap?.code).toBe('ARTIFACT_HASH_MISMATCH');
  });
});
