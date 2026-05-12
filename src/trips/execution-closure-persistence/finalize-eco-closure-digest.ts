import type { EcoClosureDigestSlice } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { TripWorldState } from '../decision/world-model';
import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import { buildEcoIdentityLedgerSnapshot } from './build-eco-identity-ledger';
import { evaluateIdentityContinuity } from './evaluate-identity-continuity';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import { attachEcoIdentityLineageToAcceptedLedger } from './attach-eco-identity-lineage';
import { ECO_LINEAGE_GENESIS_ID } from './eco-identity-lineage.types';
import {
  buildEcoIdentityGuardSnapshot,
  evaluateIdentityGuard,
} from './identity-guard';
import { computeIdentityPathCost } from './compute-identity-path-cost';
import {
  evaluateIdentityReconciliation,
  resolveEcoReconciliationPolicy,
} from './evaluate-identity-reconciliation';

/** Attach continuity proof vs prior ledger; ledger snapshot excludes proof field (built from slice body). */
export function finalizeEcoClosureDigestSlice(
  slice: EcoClosureDigestSlice,
  priorLedger: EcoIdentityLedgerSnapshot | undefined,
): EcoClosureDigestSlice {
  const currentLedger = buildEcoIdentityLedgerSnapshot(slice);
  return {
    ...slice,
    identityContinuityProof: evaluateIdentityContinuity(priorLedger, currentLedger),
  };
}

export function commitEcoIdentityLedger(
  state: TripWorldState,
  ecoClosure: EcoClosureDigestSlice | undefined,
  policy?: EcoClosurePolicy | null,
): void {
  if (!ecoClosure) return;
  if (policy?.persistEcoIdentityLedger === false) return;

  const priorLedgerSnapshot = state.signals.ecoIdentityLedger;
  const nextLedger = buildEcoIdentityLedgerSnapshot(ecoClosure);

  const pathCost = computeIdentityPathCost({
    acceptedPath:
      priorLedgerSnapshot !== undefined ? [priorLedgerSnapshot, nextLedger] : [nextLedger],
    rejectionEdges: state.signals.identityRejectionEdges ?? [],
    closureStabilityScore: ecoClosure.final.stabilityScore,
  });

  const lineagePath =
    priorLedgerSnapshot?.ecoIdentityLineage !== undefined
      ? [priorLedgerSnapshot.ecoIdentityLineage]
      : [];

  const recoResolved = resolveEcoReconciliationPolicy(policy);
  const recoDecision = evaluateIdentityReconciliation(pathCost, lineagePath, recoResolved);
  state.signals.identityReconciliationDecision = recoDecision;

  if (recoResolved.enabled && recoDecision.type === 'ROLLBACK_BRANCH') {
    const atRb = new Date().toISOString();
    state.signals.alerts = [...(state.signals.alerts ?? []), {
      code: 'ECO_IDENTITY_RECONCILIATION_ROLLBACK',
      severity: 'critical' as const,
      message: `P-E4: identity reconciliation blocked commit (${recoDecision.reason})`,
    }];
    const fromLedgerId =
      state.signals.ecoIdentityGuardSnapshot?.ledgerId ?? ECO_LINEAGE_GENESIS_ID;
    state.signals.identityRejectionEdges = [...(state.signals.identityRejectionEdges ?? []), {
      fromLedgerId,
      attemptedLedgerHash: nextLedger.digestFingerprint,
      mutationDistance: pathCost.totalCost,
      reason: `reconciliation_rollback: ${recoDecision.reason}`,
      at: atRb,
    }];
    state.signals.ecoIdentityDriftEvent = {
      at: atRb,
      tripId: state.signals.ecoLedgerTripId,
      driftScore: pathCost.totalCost,
      threshold: recoResolved.rollbackPressureThreshold,
      mode: 'observeOnly',
      ledgerRejected: true,
      contributors: {
        digestFingerprint: 0,
        semanticCore: 0,
        reflectiveLineage: 0,
        causalModel: 0,
        overlay: 0,
      },
    };
    return;
  }

  const { allowed, result, threshold, mode } = evaluateIdentityGuard(state, nextLedger, policy);

  const at = new Date().toISOString();
  state.signals.ecoIdentityDriftEvent = {
    at,
    tripId: state.signals.ecoLedgerTripId,
    driftScore: result.driftScore,
    threshold,
    mode,
    ledgerRejected: !allowed,
    contributors: result.contributors,
  };

  if (!allowed) {
    state.signals.alerts = [...(state.signals.alerts ?? []), {
      code: 'ECO_IDENTITY_GUARD_REJECT',
      severity: 'critical' as const,
      message: `P-Evolution-1: identity ledger commit blocked (drift=${result.driftScore.toFixed(3)} > threshold=${Number.isFinite(threshold) ? threshold : '∞'})`,
    }];
    const fromLedgerId =
      state.signals.ecoIdentityGuardSnapshot?.ledgerId ?? ECO_LINEAGE_GENESIS_ID;
    const rej = {
      fromLedgerId,
      attemptedLedgerHash: nextLedger.digestFingerprint,
      mutationDistance: result.driftScore,
      reason: `guard_enforce: drift ${result.driftScore.toFixed(3)} > threshold ${Number.isFinite(threshold) ? threshold : '∞'}`,
      at,
    };
    state.signals.identityRejectionEdges = [...(state.signals.identityRejectionEdges ?? []), rej];
    return;
  }

  attachEcoIdentityLineageToAcceptedLedger(state, nextLedger, policy);
  state.signals.ecoIdentityLedger = nextLedger;
  state.signals.ecoIdentityGuardSnapshot = buildEcoIdentityGuardSnapshot(state);

  if (state.signals.ecoOrchestrationDigest?.ran && nextLedger.ecoIdentityLineage) {
    state.signals.ecoOrchestrationDigest.lineageRef = nextLedger.ecoIdentityLineage;
  }

  if (state.signals.ecoOrchestrationDigest?.ran) {
    state.signals.ecoOrchestrationDigest.trajectory = pathCost;
  }

  if (result.exceededThreshold && mode === 'observeOnly') {
    state.signals.alerts = [...(state.signals.alerts ?? []), {
      code: 'ECO_IDENTITY_GUARD_DRIFT',
      severity: 'warn' as const,
      message: `P-Evolution-1: mutation drift ${result.driftScore.toFixed(3)} exceeds threshold ${threshold} (observeOnly; ledger updated)`,
    }];
  }
}

export function applyEcoIdentityDriftAlert(state: TripWorldState, ecoClosure: EcoClosureDigestSlice | undefined): void {
  const proof = ecoClosure?.identityContinuityProof;
  if (!proof || proof.identityPreserved) return;
  const alert = {
    code: 'ECO_IDENTITY_CONTINUITY_DRIFT',
    severity: 'warn' as const,
    message: `ECO existential continuity check: ${proof.reasons.join('; ') || 'identity_not_preserved'}`,
  };
  state.signals.alerts = [...(state.signals.alerts ?? []), alert];
}
