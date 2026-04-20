import { buildResearchEvidenceSnapshot } from './research-evidence-snapshot';

describe('buildResearchEvidenceSnapshot', () => {
  it('同一 requestId+researchData 产生相同 snapshot id', () => {
    const rd = { a: 1, b: 'x' };
    const s1 = buildResearchEvidenceSnapshot('req-1', rd);
    const s2 = buildResearchEvidenceSnapshot('req-1', rd);
    expect(s1.researchEvidenceSnapshotId).toBe(s2.researchEvidenceSnapshotId);
    expect(s1.evidenceVersion).toBeDefined();
  });

  it('不同 researchData 产生不同 snapshot id', () => {
    const a = buildResearchEvidenceSnapshot('req-1', { x: 1 });
    const b = buildResearchEvidenceSnapshot('req-1', { x: 2 });
    expect(a.researchEvidenceSnapshotId).not.toBe(b.researchEvidenceSnapshotId);
  });
});
