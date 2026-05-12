import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { PolicyFitness } from '../contracts/policy-agent.types';
import { DEFAULT_POLICY_FITNESS } from '../contracts/policy-agent.types';
import { analyzeExecutionTrace } from './trace-analyzer.util';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Derive fitness scalars from sealed ETK traces (population-level signal, not static defaults).
 *
 * Heuristic v1: deviations → success proxy; step latencies → latency; anomalies → stability / resistance.
 */
export function computeFitnessFromExecutionTraces(
  traces: ExecutionTrace[],
  seed?: Partial<PolicyFitness>,
): PolicyFitness {
  if (traces.length === 0) {
    return { ...DEFAULT_POLICY_FITNESS, ...seed };
  }

  let latencySum = 0;
  let latencyN = 0;
  let deviationSum = 0;
  let anomalyScore = 0;

  for (const tr of traces) {
    for (const s of tr.steps) {
      const ms = s.metadata?.latencyMs;
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        latencySum += ms;
        latencyN++;
      }
    }
    const analysis = analyzeExecutionTrace({
      expectedDecision: tr.decision,
      trace: tr,
    });
    deviationSum += analysis.deviationSignals.length;

    for (const a of tr.anomalies ?? []) {
      anomalyScore += a.severity === 'ERROR' ? 0.2 : a.severity === 'WARNING' ? 0.08 : 0.03;
    }
  }

  const n = traces.length;
  const avgLatency = latencyN > 0 ? latencySum / latencyN : seed?.latency ?? 0;

  const successRate = clamp01(1 - deviationSum / Math.max(1, n * 4));
  const replayStability = clamp01(1 - anomalyScore / Math.max(1, n * 2));
  const anomalyResistance = clamp01(1 - anomalyScore / Math.max(1, n * 3));
  const domainCoverage = clamp01(
    (seed?.domainCoverage ?? 0.45) + Math.min(0.35, n / 40),
  );

  return {
    successRate,
    latency: avgLatency,
    replayStability,
    anomalyResistance,
    domainCoverage,
  };
}
