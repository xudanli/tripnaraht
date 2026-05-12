import type {
  ExecutionControlContext,
  ExecutionDecision,
} from '../contracts/execution-control-policy.types';
import type { ExecutionPolicyIR, ToolDepthMappingKey } from '../contracts/execution-policy-ir.types';
import type { ExecutionToolDepth } from '../contracts/execution-semantic-field.types';
import { createBaselineExecutionPolicyIR } from './execution-policy.defaults';
import { compilePolicy } from './execution-policy.compiler';
import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import { buildExecutionDecision } from './execution-kernel.util';

function hasImpossibleState(anomalies: ExecutionControlContext['anomalies']): boolean {
  return anomalies.some((a) => a.category === 'IMPOSSIBLE_STATE');
}

function hasErrorSeverity(
  anomalies: ExecutionControlContext['anomalies'],
  weight: number,
): boolean {
  if (weight < 0.25) return false;
  return anomalies.some((a) => a.severity === 'ERROR');
}

function slotDepth(
  ir: ExecutionPolicyIR,
  key: ToolDepthMappingKey,
  fallback: ExecutionToolDepth,
): ExecutionToolDepth {
  const v = ir.toolDepthMapping[key];
  return v ?? fallback;
}

/**
 * Pure interpreter — ECPS runtime consumes **compiled** `ExecutionPolicyIR` only.
 */
export function interpretExecutionPolicyIR(
  ctx: ExecutionControlContext,
  ir: ExecutionPolicyIR,
): ExecutionDecision {
  const band = ctx.replayConfidence.band;
  const tol = ir.thresholds.anomalyTolerance;

  if (
    band === 'INVALID' ||
    ctx.replayEligibility === 'NON_REPLAYABLE' ||
    hasImpossibleState(ctx.anomalies)
  ) {
    const toolDepth = slotDepth(ir, 'INVALID_RECOMPUTE', 'HIGH');
    return buildExecutionDecision({
      ctx,
      mode: 'RECOMPUTE',
      confidenceGate: band,
      toolDepth,
      reuseArtifact: false,
      invalidationScope: 'FULL',
    });
  }

  const mediumReuseShortcut =
    ctx.policyOverrides?.allowMediumDedupReplay === true || ir.mediumReuseShortcutEnabled;

  if (band === 'MEDIUM' && mediumReuseShortcut) {
    return buildExecutionDecision({
      ctx,
      mode: 'REUSE',
      confidenceGate: 'MEDIUM',
      toolDepth: 'NONE',
      reuseArtifact: true,
      invalidationScope: 'PARTIAL',
    });
  }

  if (band === 'HIGH' && ctx.replayEligibility === 'FULL') {
    const floor = ir.thresholds.replayConfidenceHigh;
    if (ctx.replayConfidence.score >= floor) {
      return buildExecutionDecision({
        ctx,
        mode: 'REUSE',
        confidenceGate: 'HIGH',
        toolDepth: 'NONE',
        reuseArtifact: true,
        invalidationScope: 'NONE',
      });
    }
    const toolDepth: ExecutionToolDepth =
      ctx.modeHint === 'CLAUDE_SM'
        ? 'HIGH'
        : slotDepth(ir, 'HIGH_VALIDATE_FALLBACK', 'LOW');
    return buildExecutionDecision({
      ctx,
      mode: 'VALIDATE',
      confidenceGate: 'HIGH',
      toolDepth,
      reuseArtifact: false,
      invalidationScope: 'PARTIAL',
    });
  }

  if (band === 'MEDIUM') {
    const toolDepth: ExecutionToolDepth =
      ctx.modeHint === 'CLAUDE_SM'
        ? 'HIGH'
        : slotDepth(ir, 'MEDIUM_VALIDATE', 'LOW');
    return buildExecutionDecision({
      ctx,
      mode: 'VALIDATE',
      confidenceGate: 'MEDIUM',
      toolDepth,
      reuseArtifact: false,
      invalidationScope: 'PARTIAL',
    });
  }

  if (band === 'LOW') {
    const baseTd = hasErrorSeverity(ctx.anomalies, tol)
      ? slotDepth(ir, 'LOW_WITH_ERRORS', 'HIGH')
      : slotDepth(ir, 'LOW_NO_ERRORS', 'LOW');
    const toolDepth: ExecutionToolDepth = ctx.modeHint === 'CLAUDE_SM' ? 'HIGH' : baseTd;
    return buildExecutionDecision({
      ctx,
      mode: 'RECOMPUTE',
      confidenceGate: 'LOW',
      toolDepth,
      reuseArtifact: false,
      invalidationScope: 'PARTIAL',
    });
  }

  const toolDepth = slotDepth(ir, 'DEFAULT_RECOMPUTE', 'HIGH');
  return buildExecutionDecision({
    ctx,
    mode: 'RECOMPUTE',
    confidenceGate: band,
    toolDepth,
    reuseArtifact: false,
    invalidationScope: 'FULL',
  });
}

/**
 * Back-compat ECPS entry: compile ephemeral IR from bias, then interpret.
 * Prefer injecting a cached `ExecutionPolicyIR` from `compilePolicy` when bias/traces change.
 */
export function decideExecution(
  ctx: ExecutionControlContext,
  bias: ECPSRuntimeBias = DEFAULT_ECPS_RUNTIME_BIAS,
): ExecutionDecision {
  const ir = compilePolicy([], bias, {});
  return interpretExecutionPolicyIR(ctx, ir);
}

/** Explicit baseline path (tests / golden snapshots). */
/** Baseline IR without recompilation (strict snapshot for tests / golden runs). */
export function decideExecutionFromBaselineIr(ctx: ExecutionControlContext): ExecutionDecision {
  return interpretExecutionPolicyIR(ctx, createBaselineExecutionPolicyIR());
}
