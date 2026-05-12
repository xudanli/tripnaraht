import type {
  ComputeIdentityPathCostParams,
  IdentityPathCost,
} from './identity-trajectory.types';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import type { EcoIdentityLineage, IdentityRejectionEdge } from './eco-identity-lineage.types';
import { DEFAULT_MUTATION_DISTANCE_WEIGHTS } from './eco-identity-guard.types';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Ledger-only edge energy (P-E1 carriers); excludes causal/overlay (needs live world state). */
function ledgerEdgeMutationEnergy(
  prev: EcoIdentityLedgerSnapshot,
  next: EcoIdentityLedgerSnapshot,
): number {
  const w = DEFAULT_MUTATION_DISTANCE_WEIGHTS;
  let e = 0;
  if (prev.digestFingerprint !== next.digestFingerprint) e += w.digestFingerprint;
  if (prev.semanticCoreHash !== next.semanticCoreHash) e += w.semanticCore;
  if (prev.reflectiveLineage !== next.reflectiveLineage) e += w.reflectiveLineage;
  if (prev.existentialContinuityScore !== next.existentialContinuityScore) e += 0.25;
  if (prev.ontologicalIntegrity !== next.ontologicalIntegrity) e += 0.25;
  if (prev.epistemicUndecidable !== next.epistemicUndecidable) e += 0.25;
  if (prev.confidenceSaturated !== next.confidenceSaturated) e += 0.25;
  if (prev.carryForwardMetaFreeze !== next.carryForwardMetaFreeze) e += 0.25;
  if (prev.carryForwardRecursiveFreeze !== next.carryForwardRecursiveFreeze) e += 0.25;
  if (prev.carryForwardSuggestRollback !== next.carryForwardSuggestRollback) e += 0.25;
  return e;
}

function accumulateMutationEnergy(path: EcoIdentityLedgerSnapshot[]): number {
  if (path.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    sum += ledgerEdgeMutationEnergy(path[i - 1]!, path[i]!);
  }
  return sum;
}

function ledgerIdsOnPath(path: EcoIdentityLedgerSnapshot[]): Set<string> {
  const ids = new Set<string>();
  for (const snap of path) {
    const id = snap.ecoIdentityLineage?.ledgerId;
    if (id) ids.add(id);
  }
  return ids;
}

function computeRejectionPressure(
  path: EcoIdentityLedgerSnapshot[],
  rejectionEdges: IdentityRejectionEdge[],
): number {
  const denom = Math.max(1, path.length);
  const ids = ledgerIdsOnPath(path);
  let numer = rejectionEdges.length;
  if (ids.size > 0) {
    numer = rejectionEdges.filter((e) => ids.has(e.fromLedgerId)).length;
  }
  return Math.min(1, numer / denom);
}

/**
 * Branch / ancestor divergence: combines branch switches, distinct branch labels,
 * and normalized depth spread (proxy for distance-to-shared-ancestor on a linear path).
 */
function computeBranchDivergence(path: EcoIdentityLedgerSnapshot[]): number {
  const items = path.map((p) => p.ecoIdentityLineage).filter((x): x is EcoIdentityLineage => !!x);
  if (items.length === 0) return 0;
  const depths = items.map((l) => l.depth);
  const minD = Math.min(...depths);
  const maxD = Math.max(...depths);
  const spread = maxD - minD;
  const maxDepth = Math.max(1, maxD);
  const ancestorGap = spread / maxDepth;

  const branches = new Set(items.map((l) => l.branchId));
  let switches = 0;
  for (let i = 1; i < items.length; i++) {
    if (items[i]!.branchId !== items[i - 1]!.branchId) switches++;
  }

  const branchLabelPenalty = branches.size > 1 ? Math.min(1, (branches.size - 1) * 0.35) : 0;
  const switchPenalty = Math.min(1, switches * 0.4);
  return Math.min(1, branchLabelPenalty + switchPenalty * 0.6 + ancestorGap * 0.45);
}

/**
 * Pure path functional: scores how “expensive” the accepted identity trajectory is.
 * No side effects; safe to attach to digests for audit only.
 */
export function computeIdentityPathCost(params: ComputeIdentityPathCostParams): IdentityPathCost {
  const { acceptedPath, rejectionEdges = [], closureStabilityScore = 1 } = params;
  const path = acceptedPath ?? [];

  const mutationEnergy = accumulateMutationEnergy(path);
  const rejectionPressure = computeRejectionPressure(path, rejectionEdges);
  const stabilityDecay = 1 - clamp01(closureStabilityScore);
  const branchDivergence = computeBranchDivergence(path);

  const totalCost =
    mutationEnergy + rejectionPressure + stabilityDecay + branchDivergence;
  const normalizedScore = 1 / (1 + Math.max(0, totalCost));

  return {
    totalCost,
    components: {
      mutationEnergy,
      rejectionPressure,
      stabilityDecay,
      branchDivergence,
    },
    normalizedScore: clamp01(normalizedScore),
  };
}
