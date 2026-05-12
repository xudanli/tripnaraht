import type { TripWorldState } from '../decision/world-model';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import type {
  EcoIdentityGuardSnapshot,
  MutationDistanceContributors,
  MutationDistanceResult,
  MutationDistanceWeights,
} from './eco-identity-guard.types';
import { DEFAULT_MUTATION_DISTANCE_WEIGHTS } from './eco-identity-guard.types';
import { hashJsonStable } from './hash-json-stable';

function mergeWeights(w?: MutationDistanceWeights) {
  return {
    digestFingerprint: w?.digestFingerprint ?? DEFAULT_MUTATION_DISTANCE_WEIGHTS.digestFingerprint,
    semanticCore: w?.semanticCore ?? DEFAULT_MUTATION_DISTANCE_WEIGHTS.semanticCore,
    reflectiveLineage: w?.reflectiveLineage ?? DEFAULT_MUTATION_DISTANCE_WEIGHTS.reflectiveLineage,
    causalModel: w?.causalModel ?? DEFAULT_MUTATION_DISTANCE_WEIGHTS.causalModel,
    overlay: w?.overlay ?? DEFAULT_MUTATION_DISTANCE_WEIGHTS.overlay,
  } as const;
}

/**
 * Minimal P-Evolution-1 metric: ledger field deltas + causal hash + overlay/DAG topology vs last guarded snapshot.
 * No prior ledger → ledger-only terms are zero; first tick after deploy may skip causal/overlay deltas until a snapshot exists.
 */
export function computeMutationDistance(
  prevLedger: EcoIdentityLedgerSnapshot | undefined,
  nextLedger: EcoIdentityLedgerSnapshot,
  prevSnap: EcoIdentityGuardSnapshot | undefined,
  state: TripWorldState,
  weights?: MutationDistanceWeights,
): MutationDistanceResult {
  const w = mergeWeights(weights);
  const c: MutationDistanceContributors = {
    digestFingerprint: 0,
    semanticCore: 0,
    reflectiveLineage: 0,
    causalModel: 0,
    overlay: 0,
  };

  if (prevLedger) {
    if (prevLedger.digestFingerprint !== nextLedger.digestFingerprint) {
      c.digestFingerprint = w.digestFingerprint;
    }
    if (prevLedger.semanticCoreHash !== nextLedger.semanticCoreHash) {
      c.semanticCore = w.semanticCore;
    }
    if (prevLedger.reflectiveLineage !== nextLedger.reflectiveLineage) {
      c.reflectiveLineage = w.reflectiveLineage;
    }
  }

  const causalHash = hashJsonStable(state.signals.reflectiveCausalModel ?? null);
  const frames = state.signals.executionOverlayFrames?.length ?? 0;
  const nodes = state.signals.executionTruthDAG?.nodes?.length ?? 0;

  if (prevSnap) {
    if (prevSnap.causalModelHash !== causalHash) {
      c.causalModel = w.causalModel;
    }
    if (prevSnap.overlayFrameCount !== frames || prevSnap.dagNodeCount !== nodes) {
      c.overlay = w.overlay;
    }
  }

  const driftScore =
    c.digestFingerprint +
    c.semanticCore +
    c.reflectiveLineage +
    c.causalModel +
    c.overlay;

  return {
    driftScore,
    contributors: c,
    exceededThreshold: false,
  };
}
