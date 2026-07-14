/**
 * Pure rollback-drill behaviours for M4-RA-01 (unit-testable, no staging required).
 */

import { selectUsableOrtToolsEvaluateShadow } from '../ortools-shadow-evidence-freshness.util';
import { resolveScopedAuthoritativeRepairProvider } from './selected-trips-canary';
import type { AuthorityApprovalPackage } from './authority-package.types';
import type { CanaryTripSelectionMode } from './authority-package.types';

/** RD-05/06: after evidence drift, prior OR-Tools attachment must be void. */
export function drillStaleCandidateVoid(input: {
  attachmentEvidenceVersionId: string;
  currentEvidenceVersionId: string;
  shadowAuthority?: false;
}): { usable: false } | { usable: true } {
  const usable = selectUsableOrtToolsEvaluateShadow({
    attachment: {
      evidenceVersionId: input.attachmentEvidenceVersionId,
      snapshotId: input.attachmentEvidenceVersionId,
      shadowAuthority: input.shadowAuthority ?? false,
    },
    currentEvidenceVersionId: input.currentEvidenceVersionId,
    currentSnapshotId: input.currentEvidenceVersionId,
  });
  return usable ? { usable: true } : { usable: false };
}

/** RD-03/04: killing canary must force Neptune for subsequent resolves. */
export function drillCanaryKillProvider(input: {
  gateAllowsOrtTools: boolean;
  tripId: string;
  operation: string;
  pkg: AuthorityApprovalPackage;
  stage: CanaryTripSelectionMode;
  whitelistTripIds: string[];
}): 'neptune-repair' | 'ortools-repair' {
  return resolveScopedAuthoritativeRepairProvider({
    gateAllowsOrtTools: input.gateAllowsOrtTools,
    tripId: input.tripId,
    operation: input.operation,
    pkg: input.pkg,
    stage: input.stage,
    whitelist: {
      schemaId: 'tripnara.ortools_selected_trips_whitelist@v1',
      signoffId: input.pkg.signoffId,
      destinations: ['IS'],
      selectionCriteria: [],
      tripIds: input.whitelistTripIds,
    },
  });
}

/**
 * RD-08: duplicate authorize/execute for same decisionId must not create
 * a second Plan Version id.
 */
export function drillIdempotentPlanVersionWrite(input: {
  decisionId: string;
  proposedPlanVersionId: string;
  priorWrites: Array<{ decisionId: string; planVersionId: string }>;
}): { accept: boolean; planVersionId: string; duplicate: boolean } {
  const prior = input.priorWrites.find((w) => w.decisionId === input.decisionId);
  if (prior) {
    return {
      accept: false,
      duplicate: true,
      planVersionId: prior.planVersionId,
    };
  }
  return {
    accept: true,
    duplicate: false,
    planVersionId: input.proposedPlanVersionId,
  };
}

/** Solver timeout / unavailable → authority set must stay Neptune. */
export function drillSolverUnavailableFallback(input: {
  solverOk: boolean;
  shadowCandidateCount: number;
  gateAllowsOrtTools: boolean;
}): 'neptune-repair' | 'ortools-repair' {
  if (!input.solverOk || input.shadowCandidateCount === 0) {
    return 'neptune-repair';
  }
  return input.gateAllowsOrtTools ? 'ortools-repair' : 'neptune-repair';
}

/**
 * RD-05: authorized-but-not-executed candidates discarded when canary closes.
 * In-memory queue simulation.
 */
export function drillDiscardPendingAfterCanaryOff(input: {
  pending: Array<{ candidateId: string; provider: string; executed: boolean }>;
  canaryStillOn: boolean;
}): {
  retained: string[];
  discarded: string[];
} {
  if (input.canaryStillOn) {
    return {
      retained: input.pending.map((p) => p.candidateId),
      discarded: [],
    };
  }
  const discarded = input.pending
    .filter((p) => !p.executed && p.provider === 'ortools-repair')
    .map((p) => p.candidateId);
  const retained = input.pending
    .filter((p) => !discarded.includes(p.candidateId))
    .map((p) => p.candidateId);
  return { retained, discarded };
}

/** Gateway BLOCK ⇒ never write Plan Version. */
export function drillGatewayBlockForbidsWrite(input: {
  gatewayResult: 'PASS' | 'BLOCK' | 'SKIP';
}): { mayWritePlanVersion: boolean } {
  return { mayWritePlanVersion: input.gatewayResult === 'PASS' };
}
