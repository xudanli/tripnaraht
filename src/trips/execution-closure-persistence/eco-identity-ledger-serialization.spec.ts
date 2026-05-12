import {
  parseEcoIdentityLedgerFromTripMetadata,
  serializeEcoIdentityLedgerForTripMetadata,
} from './eco-identity-ledger-serialization';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';

describe('eco-identity-ledger-serialization', () => {
  const sample: EcoIdentityLedgerSnapshot = {
    recordedAt: '2026-01-01T00:00:00.000Z',
    semanticCoreHash: 'a'.repeat(32),
    reflectiveLineage: 'ln',
    existentialContinuityScore: 0.8,
    ontologicalIntegrity: 0.9,
    epistemicUndecidable: false,
    confidenceSaturated: false,
    carryForwardMetaFreeze: false,
    carryForwardRecursiveFreeze: false,
    carryForwardSuggestRollback: false,
    digestFingerprint: 'abc',
  };

  it('round-trips through envelope', () => {
    const env = serializeEcoIdentityLedgerForTripMetadata(sample);
    const parsed = parseEcoIdentityLedgerFromTripMetadata(env);
    expect(parsed?.semanticCoreHash).toBe(sample.semanticCoreHash);
    expect(parsed?.carryForwardMetaFreeze).toBe(false);
  });

  it('rejects unknown schema', () => {
    expect(parseEcoIdentityLedgerFromTripMetadata({ schemaVersion: 'x', ledger: sample })).toBeUndefined();
  });
});
