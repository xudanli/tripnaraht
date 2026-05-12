import { computeArtifactIdentityHash } from './artifact-identity.hash';

describe('computeArtifactIdentityHash', () => {
  const base = () =>
    ({
      artifactType: 'FULL_RESPONSE' as const,
      plannerVersion: 'p1',
      freshnessDependencies: ['weatherVersion'],
      cognitionScope: 'FULL_RESPONSE_DEFAULT_SCOPE',
      semanticInputs: { internal_route_label: 'SYSTEM1_RAG', aggregate_world_state_version: null },
    }) as const;

  it('is deterministic for identical material', () => {
    const m = { ...base() };
    expect(computeArtifactIdentityHash(m)).toBe(computeArtifactIdentityHash({ ...m }));
  });

  it('64-char lowercase hex (sha256)', () => {
    const id = computeArtifactIdentityHash(base());
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when artifactType changes', () => {
    const a = computeArtifactIdentityHash(base());
    const b = computeArtifactIdentityHash({
      ...base(),
      artifactType: 'WORLD_MODEL',
    });
    expect(a).not.toBe(b);
  });

  it('semanticInputs key order does not change hash', () => {
    const m1 = {
      ...base(),
      semanticInputs: { a: 1, b: 2 },
    };
    const m2 = {
      ...base(),
      semanticInputs: { b: 2, a: 1 },
    };
    expect(computeArtifactIdentityHash(m1)).toBe(computeArtifactIdentityHash(m2));
  });
});
