import type { EcoIdentityLedgerSnapshot, IdentityContinuityProof } from './eco-identity-ledger.types';

export function evaluateIdentityContinuity(
  prior: EcoIdentityLedgerSnapshot | undefined,
  currentLedger: EcoIdentityLedgerSnapshot,
): IdentityContinuityProof {
  if (!prior) {
    return {
      priorRecordedAt: undefined,
      sameSemanticCore: true,
      sameReflectiveLineage: true,
      continuityDelta: 0,
      identityPreserved: true,
      reasons: ['no_prior_ledger'],
    };
  }

  const sameSemanticCore = prior.semanticCoreHash === currentLedger.semanticCoreHash;
  const sameReflectiveLineage = prior.reflectiveLineage === currentLedger.reflectiveLineage;
  const continuityDelta = Math.abs(prior.existentialContinuityScore - currentLedger.existentialContinuityScore);

  const reasons: string[] = [];
  if (!sameSemanticCore) reasons.push('semantic_core_hash_drift');
  if (!sameReflectiveLineage) reasons.push('reflective_lineage_drift');

  const lineageOk = sameSemanticCore && sameReflectiveLineage;
  const scoreOk = continuityDelta < 0.42;
  const digestOk = prior.digestFingerprint === currentLedger.digestFingerprint || lineageOk;

  const identityPreserved = lineageOk && scoreOk && digestOk;
  if (!scoreOk) reasons.push('existential_score_jump');
  if (!digestOk && lineageOk) reasons.push('digest_fingerprint_drift');

  return {
    priorRecordedAt: prior.recordedAt,
    sameSemanticCore,
    sameReflectiveLineage,
    continuityDelta,
    identityPreserved,
    reasons,
  };
}
