/**
 * ECO — wires P7 semantic consensus, P8 counterfactual audit fields, P9 causal planning,
 * P10 reflective model update into one post-Neptune control plane (optional; default off).
 */

import type { TripWorldState } from '../decision/world-model';
import type { NeptuneRepairResult } from '../decision/strategies/neptune';
import { buildExecutionProof } from '../execution-trace-compressor/build-execution-proof';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import { verifyExecutionProof } from '../execution-verifier/verify-execution-proof';
import type { ExecutionProofVerificationResult } from '../execution-verifier/verify-execution-proof';
import { runSemanticConsensus } from '../consensus/semantic-consensus-engine';
import type { SemanticReplica } from '../consensus/semantic-replica.types';
import { generateStandardCounterfactualBranches } from '../counterfactual/generate-branches';
import {
  evaluateBaselineBranch,
  evaluateCounterfactualBranches,
} from '../counterfactual/evaluate-branches';
import {
  attachCounterfactualToProof,
  selectCounterfactualDecision,
} from '../counterfactual/select-counterfactual-decision';
import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import { projectPhysicsIndexToCausalGraph, planCausalInterventions, attachCausalPlanningToProof } from '../causal-physics';
import { graphToCausalModel } from '../causal-reflection/causal-model-rewriter';
import { attachReflectiveCausalToProof, runReflectiveSelfUpdate } from '../causal-reflection/self-update-loop';
import type { EcoOrchestrationDigest, EcoPipelineMode } from './execution-cognitive-orchestrator.types';

export type { EcoOrchestrationDigest, EcoPipelineMode, EcoPipelinePolicy } from './execution-cognitive-orchestrator.types';

export interface EcoOrchestrationResult {
  neptuneResult: NeptuneRepairResult;
  digest: EcoOrchestrationDigest;
}

function resolveEcoMode(state: TripWorldState): EcoPipelineMode {
  const m = state.policies?.ecoPipeline?.mode;
  if (m === 'partial' || m === 'full' || m === 'legacy') {
    return m;
  }
  return 'full';
}

/** Policy or `TRIP_ECO_PIPELINE=1`. */
export function isEcoPipelineEnabled(state: TripWorldState): boolean {
  if (state.policies?.ecoPipeline?.enabled === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_ECO_PIPELINE === '1') {
    return true;
  }
  return false;
}

/** True when ECO should execute cognitive stages (not `legacy`). */
export function shouldRunEcoPipeline(state: TripWorldState): boolean {
  if (!isEcoPipelineEnabled(state)) {
    return false;
  }
  return resolveEcoMode(state) !== 'legacy';
}

function materializeProof(state: TripWorldState, r: NeptuneRepairResult): ExecutionProof | undefined {
  if (r.executionProof) {
    return r.executionProof;
  }
  const attachSemanticLayer =
    state.policies?.semanticProofLayer === true ||
    (typeof process !== 'undefined' && process.env?.TRIP_EXECUTION_SEMANTICS === '1');
  return buildExecutionProof({
    physicsFieldIndex: state.signals.physicsFieldIndex ?? null,
    executionOverlayFrames: state.signals.executionOverlayFrames ?? null,
    executionTruthDAG: state.signals.executionTruthDAG,
    executionIR: state.signals.executionIR,
    irVmRun: { pathCost: r.irVm.pathCost, ok: r.irVm.ok },
    executionTrace: r.executionTrace,
    triggers: r.triggers,
    changedSlotIds: r.changedSlotIds,
    attachSemanticLayer,
  });
}

/**
 * Post-Neptune: run P7–P10 on the execution proof; merge audit fields; re-verify when proof changes.
 * Does not re-invoke Neptune — refines the **artifact bundle** and optional causal snapshot on `state`.
 */
export function runExecutionCognitiveOrchestration(
  state: TripWorldState,
  neptuneResult: NeptuneRepairResult,
): EcoOrchestrationResult {
  const mode = resolveEcoMode(state);
  const digest: EcoOrchestrationDigest = { ran: true, mode, stages: {} };

  if (!shouldRunEcoPipeline(state)) {
    return {
      neptuneResult,
      digest: { ...digest, ran: false, skippedReason: 'eco_disabled_or_legacy' },
    };
  }

  const idx = state.signals.physicsFieldIndex;
  let proof = materializeProof(state, neptuneResult);
  if (!proof) {
    return {
      neptuneResult,
      digest: { ...digest, skippedReason: 'no_proof' },
    };
  }

  let invariantCheckResult: ExecutionProofVerificationResult | undefined = neptuneResult.invariantCheckResult;

  const runP8 = mode === 'full';

  try {
    // —— P7 ——
    const replica: SemanticReplica = {
      replicaId: 'baseline',
      physicsField: idx ?? buildPhysicsFieldIndex([]),
      executionProof: proof,
      timestamp: Date.now(),
      confidence: 0.9,
    };
    const consensus = runSemanticConsensus([replica]);
    proof = consensus.consensusProof;
    digest.stages!.p7 = true;
    digest.p7ConsensusStable = consensus.stableDecision;

    // —— P8 ——
    if (runP8 && idx?.byLegId && Object.keys(idx.byLegId).length > 0) {
      const branches = generateStandardCounterfactualBranches(`eco:${state.context.destination}`);
      const baseline = evaluateBaselineBranch(idx, 'baseline');
      const perturbed = evaluateCounterfactualBranches(idx, branches);
      const cf = selectCounterfactualDecision(baseline, perturbed, branches, 'optimistic_semantic');
      proof = attachCounterfactualToProof(proof, cf);
      digest.stages!.p8 = true;
      digest.p8ChosenBranchId = cf.chosenBranchId;
    }

    // —— P9 / P10 —— (require causal projection)
    if (idx?.byLegId && Object.keys(idx.byLegId).length > 0) {
      const graphBefore = projectPhysicsIndexToCausalGraph(idx);
      const plan = planCausalInterventions(graphBefore);
      proof = attachCausalPlanningToProof(proof, graphBefore, plan);
      digest.stages!.p9 = true;
      digest.p9UtilityScore = plan.utilityScore;

      const modelBefore = graphToCausalModel(graphBefore, {
        confidence: state.signals.reflectiveCausalModel?.meta.confidence ?? 0.85,
        origin: 'INFERRED',
        revisionEpoch: state.signals.reflectiveCausalModel?.meta.revisionEpoch ?? 0,
      });
      const semDist = proof.semanticAggregateDistance ?? 0;
      const observedUtility = Math.max(0, Math.min(1, 1 - semDist));
      const p10 = runReflectiveSelfUpdate(modelBefore, {
        predictedUtility: plan.utilityScore,
        observedUtility,
        observedGraph: plan.graphAfter,
      });
      proof = attachReflectiveCausalToProof(
        proof,
        modelBefore,
        p10.modelAfter,
        p10.patchesApplied,
        p10.driftScore,
        p10.stabilityScore,
      );
      digest.stages!.p10 = true;
      digest.p10DriftScore = p10.driftScore;
    }
  } catch (e) {
    digest.skippedReason = e instanceof Error ? e.message : String(e);
    return { neptuneResult, digest };
  }

  invariantCheckResult = verifyExecutionProof(proof);

  return {
    neptuneResult: {
      ...neptuneResult,
      executionProof: proof,
      invariantCheckResult,
    },
    digest,
  };
}

/** Write-back hook: stash digest + last reflective causal model on signals for the next tick. */
export function commitEcoWorldModelUpdate(state: TripWorldState, result: EcoOrchestrationResult): void {
  state.signals.ecoOrchestrationDigest = result.digest;
  const proof = result.neptuneResult.executionProof;
  if (proof?.causalModelAfter) {
    state.signals.reflectiveCausalModel = proof.causalModelAfter;
  }
}
