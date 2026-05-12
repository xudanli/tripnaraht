/**
 * P14 — Deterministic drift detectors: structural IR/DAG alignment, baselines, policy/Neptune deltas.
 */

import { buildConstraintProof } from '../constraint-proof/build-constraint-proof';
import type { ExecutionConstraintProof } from '../constraint-proof/constraint-proof.types';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import { ExecutionIRSources } from '../execution-ir/execution-ir.types';
import { stableExecutionDagId } from '../execution-ir/stable-dag-id';
import { stableExecutionIrId } from '../execution-memory/stable-execution-ir-id';
import type { StabilityDetectionContext, StabilityDriftSignal } from './stability.types';

function sevFromDelta(delta: number): StabilityDriftSignal['severity'] {
  if (delta >= 0.45) {
    return 'HIGH';
  }
  if (delta >= 0.25) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function detectDagDrift(
  dag: ExecutionTruthDAG | undefined,
  ir: ExecutionIR | undefined,
  baseline: StabilityDetectionContext['baseline'],
): StabilityDriftSignal[] {
  const out: StabilityDriftSignal[] = [];
  if (!dag || !ir) {
    return out;
  }

  const truth = stableExecutionDagId(dag);
  if (ir.meta.dagId !== truth) {
    out.push({
      type: 'DAG_STRUCTURE_DRIFT',
      severity: 'HIGH',
      dagId: ir.meta.dagId,
      irId: stableExecutionIrId(ir),
      description: 'IR.meta.dagId does not match stableExecutionDagId(witness DAG)',
      deltaScore: 0.5,
    });
  }

  if (baseline?.truthHash && baseline.truthHash !== truth) {
    out.push({
      type: 'DAG_STRUCTURE_DRIFT',
      severity: sevFromDelta(0.4),
      dagId: truth,
      description: 'ExecutionTruthDAG structural hash drifted vs baseline truthHash',
      deltaScore: 0.4,
    });
  }

  return out;
}

export function detectIRDrift(
  dag: ExecutionTruthDAG | undefined,
  ir: ExecutionIR | undefined,
  baseline: StabilityDetectionContext['baseline'],
): StabilityDriftSignal[] {
  const out: StabilityDriftSignal[] = [];
  if (!ir) {
    return out;
  }

  if (ir.meta.deterministic !== true) {
    out.push({
      type: 'IR_DETERMINISM_DRIFT',
      severity: 'HIGH',
      dagId: ir.meta.dagId,
      irId: stableExecutionIrId(ir),
      description: 'ExecutionIR.meta.deterministic is not locked true',
      deltaScore: 0.55,
    });
  }

  const fp = stableExecutionIrId(ir);
  if (baseline?.irFingerprint && baseline.irFingerprint !== fp) {
    out.push({
      type: 'IR_DETERMINISM_DRIFT',
      severity: 'MEDIUM',
      dagId: ir.meta.dagId,
      irId: fp,
      description: 'IR structural fingerprint drifted vs baseline (compiler or witness change)',
      deltaScore: 0.35,
    });
  }

  if (dag && ir.meta.source !== ExecutionIRSources.DAG_COMPILER) {
    out.push({
      type: 'IR_DETERMINISM_DRIFT',
      severity: 'HIGH',
      dagId: ir.meta.dagId,
      irId: fp,
      description: 'ExecutionIR was not produced by compileDAGToIR (meta.source)',
      deltaScore: 0.6,
    });
  }

  return out;
}

function resolveProof(
  dag: ExecutionTruthDAG | undefined,
  explicit?: ExecutionConstraintProof,
): ExecutionConstraintProof | undefined {
  if (explicit) {
    return explicit;
  }
  if (!dag?.nodes?.length) {
    return undefined;
  }
  return buildConstraintProof(dag);
}

export function detectConstraintDrift(
  dag: ExecutionTruthDAG | undefined,
  ctx: StabilityDetectionContext,
): StabilityDriftSignal[] {
  const proof = resolveProof(dag, ctx.proof);
  if (!proof || !ctx.baseline?.proofGlobalStatus) {
    return [];
  }
  if (ctx.baseline.proofGlobalStatus === proof.globalStatus) {
    return [];
  }
  return [
    {
      type: 'CONSTRAINT_DRIFT',
      severity: 'HIGH',
      dagId: proof.dagId,
      description: `Constraint proof globalStatus changed: baseline=${ctx.baseline.proofGlobalStatus} current=${proof.globalStatus}`,
      deltaScore: 0.38,
    },
  ];
}

export function detectPolicyDrift(ctx: StabilityDetectionContext): StabilityDriftSignal[] {
  if (!ctx.baseline?.policyId || !ctx.executionPolicyId) {
    return [];
  }
  if (ctx.baseline.policyId === ctx.executionPolicyId) {
    return [];
  }
  return [
    {
      type: 'POLICY_BEHAVIOR_DRIFT',
      severity: 'MEDIUM',
      description: `Static execution policy id drift: baseline=${ctx.baseline.policyId} current=${ctx.executionPolicyId}`,
      deltaScore: 0.3,
    },
  ];
}

export function detectNeptuneDrift(ctx: StabilityDetectionContext): StabilityDriftSignal[] {
  const b = ctx.baseline?.neptuneTriggerCount;
  const cur = ctx.neptuneTriggerCount;
  if (b === undefined || cur === undefined) {
    return [];
  }
  const delta = Math.abs(cur - b);
  if (delta === 0) {
    return [];
  }
  const normalized = Math.min(1, delta / 8);
  return [
    {
      type: 'NEPTUNE_DECISION_DRIFT',
      severity: sevFromDelta(normalized * 0.5),
      description: `Neptune trigger count moved vs baseline: ${b} → ${cur}`,
      deltaScore: Math.min(0.45, 0.12 + normalized * 0.35),
    },
  ];
}

export interface DetectStabilityDriftsInput extends StabilityDetectionContext {
  dag?: ExecutionTruthDAG;
  ir?: ExecutionIR;
}

export function detectStabilityDrifts(ctx: DetectStabilityDriftsInput): StabilityDriftSignal[] {
  const { dag, ir } = ctx;
  return [
    ...detectDagDrift(dag, ir, ctx.baseline),
    ...detectIRDrift(dag, ir, ctx.baseline),
    ...detectConstraintDrift(dag, ctx),
    ...detectPolicyDrift(ctx),
    ...detectNeptuneDrift(ctx),
  ];
}
