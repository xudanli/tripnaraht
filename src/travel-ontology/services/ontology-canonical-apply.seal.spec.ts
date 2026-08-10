import {
  assertCanonicalEffectiveWriteOrFailedSafe,
  OntologyWriteFailedSafeError,
} from '../authority/canonical-effective-write-seal.util';

describe('OntologyCanonicalApply seal (Authority Consistency)', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('fails closed when directSetEffective=true', () => {
    process.env.ONTOLOGY_AUTHORITY_INTERNAL_GATE1 = '1';
    process.env.ONTOLOGY_AUTHORITY_ROLLOUT_MODE = 'ON';
    expect(() =>
      assertCanonicalEffectiveWriteOrFailedSafe({
        caller: 'test',
        assessmentId: 'ca_1',
        authorityRunId: 'run_1',
        basedOnRevision: 1,
        tripId: 'ont_canary_is_wind_1',
        canonicalApply: true,
        directSetEffective: true,
      }),
    ).toThrow(OntologyWriteFailedSafeError);
  });

  it('fails when canonicalApply is false', () => {
    process.env.ONTOLOGY_AUTHORITY_INTERNAL_GATE1 = '1';
    expect(() =>
      assertCanonicalEffectiveWriteOrFailedSafe({
        caller: 'test',
        assessmentId: 'ca_1',
        authorityRunId: 'run_1',
        basedOnRevision: 1,
        tripId: 'ont_canary_is_wind_1',
        canonicalApply: false,
        directSetEffective: false,
      }),
    ).toThrow(/Canonical Apply/);
  });
});
