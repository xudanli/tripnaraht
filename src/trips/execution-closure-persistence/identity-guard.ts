import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { TripWorldState } from '../decision/world-model';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import { computeMutationDistance } from './compute-mutation-distance';
import type {
  EcoIdentityGuardSnapshot,
  IdentityGuardMode,
  MutationDistanceResult,
} from './eco-identity-guard.types';
import { hashJsonStable } from './hash-json-stable';

const DEFAULT_ENFORCE_THRESHOLD = 2.5;

export function resolveIdentityGuardMode(
  policy?: EcoClosurePolicy | null,
): IdentityGuardMode {
  const p = policy?.identityGuard?.mode;
  if (p === 'enforce' || p === 'observeOnly') {
    return p;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_IDENTITY_GUARD_ENFORCE === '1') {
    return 'enforce';
  }
  return 'observeOnly';
}

export function resolveMutationThreshold(
  policy: EcoClosurePolicy | null | undefined,
  mode: IdentityGuardMode,
): number {
  const t = policy?.identityGuard?.mutationDistanceThreshold;
  if (typeof t === 'number' && Number.isFinite(t) && t >= 0) {
    return t;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_IDENTITY_GUARD_THRESHOLD !== undefined) {
    const env = process.env.TRIP_IDENTITY_GUARD_THRESHOLD;
    if (env !== '') {
      const p = parseFloat(env);
      if (Number.isFinite(p) && p >= 0) {
        return p;
      }
    }
  }
  if (mode === 'enforce') {
    return DEFAULT_ENFORCE_THRESHOLD;
  }
  return Number.POSITIVE_INFINITY;
}

export function buildEcoIdentityGuardSnapshot(state: TripWorldState): EcoIdentityGuardSnapshot {
  const lineage = state.signals.ecoIdentityLedger?.ecoIdentityLineage;
  const snap: EcoIdentityGuardSnapshot = {
    causalModelHash: hashJsonStable(state.signals.reflectiveCausalModel ?? null),
    overlayFrameCount: state.signals.executionOverlayFrames?.length ?? 0,
    dagNodeCount: state.signals.executionTruthDAG?.nodes?.length ?? 0,
  };
  if (lineage) {
    snap.ledgerId = lineage.ledgerId;
    snap.branchId = lineage.branchId;
    snap.depth = lineage.depth;
  }
  return snap;
}

export interface IdentityGuardEvaluation {
  allowed: boolean;
  result: MutationDistanceResult;
  threshold: number;
  mode: IdentityGuardMode;
}

export function evaluateIdentityGuard(
  state: TripWorldState,
  nextLedger: EcoIdentityLedgerSnapshot,
  policy?: EcoClosurePolicy | null,
): IdentityGuardEvaluation {
  const mode = resolveIdentityGuardMode(policy);
  let threshold = resolveMutationThreshold(policy, mode);
  const mf = state.signals.pressureRegulation?.mutationThresholdFactor ?? 1;
  if (mf > 0 && mf < 1 && Number.isFinite(threshold)) {
    threshold = threshold * mf;
  }
  const weights = policy?.identityGuard?.weights;
  const prevLedger = state.signals.ecoIdentityLedger;
  const prevSnap = state.signals.ecoIdentityGuardSnapshot;

  const result = computeMutationDistance(prevLedger, nextLedger, prevSnap, state, weights);
  result.exceededThreshold = Number.isFinite(threshold) && result.driftScore > threshold;

  const allowed = mode === 'observeOnly' || !result.exceededThreshold;

  return { allowed, result, threshold, mode };
}
