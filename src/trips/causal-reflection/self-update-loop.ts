/**
 * P-Next 10 — Observe → drift → revise → emit patches (reflective worldview update).
 */

import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import type { CausalEvidence, CausalModel, ModelPatch } from './causal-model.types';
import { causalModelToGraph, reviseModel } from './causal-model-rewriter';
import { detectCausalDrift } from './drift-detector';

export interface SelfUpdateLoopResult {
  modelAfter: CausalModel;
  driftReport: ReturnType<typeof detectCausalDrift>;
  patchesApplied: ModelPatch[];
  driftScore: number;
  stabilityScore: number;
}

/**
 * Compare predicted vs observed, revise structural weights, derive drift/stability scores for proofs.
 */
export function runReflectiveSelfUpdate(
  modelBefore: CausalModel,
  evidence: CausalEvidence,
): SelfUpdateLoopResult {
  const predictedGraph = causalModelToGraph(modelBefore);
  const driftReport = detectCausalDrift({
    predictedUtility: evidence.predictedUtility,
    observedUtility: evidence.observedUtility,
    predictedGraph,
    observedGraph: evidence.observedGraph,
  });

  const modelAfter = reviseModel(modelBefore, evidence);

  const driftScore = clamp01(
    driftReport.utilityGap * 0.5 +
      driftReport.edgeDrift * 0.25 +
      driftReport.nodeDrift * 0.25,
  );
  const stabilityScore = clamp01(1 - driftScore);

  const patchesApplied: ModelPatch[] = [];
  for (let i = 0; i < modelBefore.edges.length; i++) {
    const be = modelBefore.edges[i]!;
    const ae = modelAfter.edges[i];
    if (ae && be.weight !== ae.weight) {
      patchesApplied.push({
        id: `edge:${be.from}->${be.to}`,
        edgeUpdates: [{ from: be.from, to: be.to, deltaWeight: ae.weight - be.weight }],
      });
    }
  }
  if (modelBefore.meta.confidence !== modelAfter.meta.confidence) {
    patchesApplied.push({
      id: 'meta:confidence',
      metaConfidenceDelta: modelAfter.meta.confidence - modelBefore.meta.confidence,
      bumpRevisionEpoch: modelAfter.meta.revisionEpoch !== modelBefore.meta.revisionEpoch,
    });
  }

  return {
    modelAfter,
    driftReport,
    patchesApplied,
    driftScore,
    stabilityScore,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function attachReflectiveCausalToProof(
  proof: ExecutionProof,
  before: CausalModel,
  after: CausalModel,
  patches: ModelPatch[],
  driftScore: number,
  stabilityScore: number,
): ExecutionProof {
  return {
    ...proof,
    causalModelBefore: before,
    causalModelAfter: after,
    modelRevisions: patches,
    driftScore,
    stabilityScore,
  };
}
