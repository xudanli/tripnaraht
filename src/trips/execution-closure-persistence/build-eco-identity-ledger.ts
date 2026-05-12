import { createHash } from 'crypto';
import type { EcoClosureDigestSlice } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';

/** Extract persisted ledger fields from a fully-built closure slice (independent of continuity proof field). */
export function buildEcoIdentityLedgerSnapshot(slice: EcoClosureDigestSlice): EcoIdentityLedgerSnapshot {
  const semanticCoreHash = slice.executionIdentity?.semanticCoreHash ?? 'unknown';
  const reflectiveLineage = slice.semanticContinuity?.reflectiveLineage ?? '';
  const existentialContinuityScore =
    slice.existentialAssessment?.continuityScore ??
    slice.existentialIdentity?.semanticContinuity ??
    0;
  const ontologicalIntegrity = slice.existentialAssessment?.ontologicalIntegrity ?? 0;
  const epistemicUndecidable = slice.epistemicAssessment?.undecidable ?? false;
  const confidenceSaturated = slice.confidenceHorizonAudit?.confidenceSaturated ?? false;
  const carryForwardMetaFreeze = slice.metaStabilityGuard?.freezePolicyEvolution ?? false;
  const carryForwardRecursiveFreeze = slice.recursiveBoundary?.freezeReflection ?? false;
  const carryForwardSuggestRollback = slice.contractionProof?.suggestRollback ?? false;

  const digestFingerprint = createHash('sha256')
    .update(
      `${semanticCoreHash}|${reflectiveLineage}|${slice.metaExecutionState?.convergencePolicy ?? ''}|${slice.metaExecutionState?.patchStrategy ?? ''}|${slice.metaExecutionState?.proofSemantics ?? ''}`,
      'utf8',
    )
    .digest('hex')
    .slice(0, 32);

  return {
    recordedAt: new Date().toISOString(),
    semanticCoreHash,
    reflectiveLineage,
    existentialContinuityScore,
    ontologicalIntegrity,
    epistemicUndecidable,
    confidenceSaturated,
    carryForwardMetaFreeze,
    carryForwardRecursiveFreeze,
    carryForwardSuggestRollback,
    digestFingerprint,
  };
}
