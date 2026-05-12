import type { ExecutionPolicyIR, PolicyConstraints } from '../contracts/execution-policy-ir.types';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import { analyzeExecutionTrace } from './trace-analyzer.util';
import { createBaselineExecutionPolicyIR, EXECUTION_POLICY_IR_VERSION } from './execution-policy.defaults';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clampBiasComponent(n: number): number {
  return clamp(n, -1, 1);
}

function fingerprintBias(b: ECPSRuntimeBias): string {
  return `${b.system1BiasAdjustment.toFixed(4)}:${b.replayThresholdShift.toFixed(4)}:${b.anomalyPenaltyWeight.toFixed(4)}`;
}

/**
 * Aggregate trace-derived tightening hints (training signal → IR metadata + threshold nudges).
 */
function traceDerivedAdjustments(traces: ExecutionTrace[]): {
  replayFloorDelta: number;
  rules: ExecutionPolicyIR['rules'];
} {
  let replayFloorDelta = 0;
  const rules: ExecutionPolicyIR['rules'] = [];
  let idx = 0;

  for (const tr of traces) {
    const analysis = analyzeExecutionTrace({
      expectedDecision: tr.decision,
      trace: tr,
    });
    for (const d of analysis.deviationSignals) {
      idx += 1;
      if (d.kind === 'REPLAY_VIOLATION') {
        replayFloorDelta += 0.015;
        rules.push({
          id: `trace:${tr.traceId}:replay_violation:${idx}`,
          priority: 100,
          predicate: `deviation:${d.kind}`,
          effect: 'THRESHOLD_SHIFT',
          metadata: { artifactId: tr.artifactId },
        });
      }
      if (d.kind === 'ROUTING_DEVIATION') {
        rules.push({
          id: `trace:${tr.traceId}:routing:${idx}`,
          priority: 80,
          predicate: `deviation:${d.kind}`,
          effect: 'KERNEL_NUDGE',
          metadata: { artifactId: tr.artifactId },
        });
      }
      if (d.kind === 'TOOL_DEPTH_MISMATCH') {
        replayFloorDelta += 0.005;
        rules.push({
          id: `trace:${tr.traceId}:tool_depth:${idx}`,
          priority: 60,
          predicate: `deviation:${d.kind}`,
          effect: 'RULE_NOTE',
          metadata: { artifactId: tr.artifactId },
        });
      }
    }
  }

  return { replayFloorDelta, rules };
}

/**
 * Deterministic compiler: ETK traces + PCK bias + static constraints → sealed `ExecutionPolicyIR`.
 */
export function compilePolicy(
  traces: ExecutionTrace[],
  bias: ECPSRuntimeBias = DEFAULT_ECPS_RUNTIME_BIAS,
  constraints: PolicyConstraints = {},
  nowMs: number = Date.now(),
): ExecutionPolicyIR {
  const b = {
    system1BiasAdjustment: clampBiasComponent(bias.system1BiasAdjustment),
    replayThresholdShift: clampBiasComponent(bias.replayThresholdShift),
    anomalyPenaltyWeight: clamp(bias.anomalyPenaltyWeight, 0.25, 3),
  };

  const base = createBaselineExecutionPolicyIR(nowMs);
  const { replayFloorDelta, rules: traceRules } = traceDerivedAdjustments(traces);

  let replayHigh =
    base.thresholds.replayConfidenceHigh - 0.12 * b.replayThresholdShift + replayFloorDelta;

  const bounds = constraints.replayReuseFloorBounds;
  if (bounds) {
    replayHigh = clamp(replayHigh, bounds.min, bounds.max);
  } else {
    replayHigh = clamp(replayHigh, 0.55, 0.98);
  }

  let anomalyTol = b.anomalyPenaltyWeight;
  anomalyTol = clamp(anomalyTol, 0.25, 3);

  const mediumShortcut =
    !constraints.disallowMediumReuseShortcut && b.system1BiasAdjustment > 0.35;

  const maxRules = constraints.maxRules ?? 64;
  const rules = [...traceRules].slice(0, maxRules);

  const ir: ExecutionPolicyIR = {
    version: EXECUTION_POLICY_IR_VERSION,
    compiledAt: nowMs,
    sourceSummary: {
      traceCount: traces.length,
      biasFingerprint: fingerprintBias(bias),
    },
    rules,
    thresholds: {
      replayConfidenceHigh: replayHigh,
      replayConfidenceLow: base.thresholds.replayConfidenceLow,
      anomalyTolerance: anomalyTol,
    },
    toolDepthMapping: { ...base.toolDepthMapping },
    mediumReuseShortcutEnabled: mediumShortcut,
  };

  return ir;
}
