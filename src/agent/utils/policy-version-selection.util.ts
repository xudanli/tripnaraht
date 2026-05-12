import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type {
  ExecutionPolicyVersion,
  PolicyVersionMetrics,
} from '../contracts/execution-policy-version.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

/** Signals used to rank policy variants at selection time (PV-ER). */
export interface PolicySelectionContext {
  replayConfidenceScore: number;
  replayBand: ExecutionControlContext['replayConfidence']['band'];
  anomalyCount: number;
  routeHint?: string;
  latencyBudgetMs?: number;
  /** Future: domain / tenant tags for weighted match against `ExecutionPolicyVersion.labels`. */
  preferredLabels?: string[];
}

export function buildPolicySelectionContext(
  ecpsCtx: ExecutionControlContext,
  request: RouteAndRunRequestDto,
): PolicySelectionContext {
  const opts = request.options;
  const maxSec = opts?.max_seconds;
  const latencyBudgetMs =
    typeof maxSec === 'number' && Number.isFinite(maxSec) ? Math.round(maxSec * 1000) : undefined;
  const rh = ecpsCtx.routeHint;
  return {
    replayConfidenceScore: ecpsCtx.replayConfidence.score,
    replayBand: ecpsCtx.replayConfidence.band,
    anomalyCount: ecpsCtx.anomalies?.length ?? 0,
    routeHint: typeof rh === 'string' ? rh : undefined,
    latencyBudgetMs,
    preferredLabels: undefined,
  };
}

function labelOverlapScore(version: ExecutionPolicyVersion, ctx: PolicySelectionContext): number {
  if (!ctx.preferredLabels?.length || !version.labels?.length) return 0;
  const set = new Set(version.labels);
  let n = 0;
  for (const l of ctx.preferredLabels) {
    if (set.has(l)) n += 1;
  }
  return n / ctx.preferredLabels.length;
}

/**
 * Scalar fitness for argmax selection — higher is better.
 * Combines stored metrics with lightweight context alignment (HIGH band favors replay stability).
 */
export function scorePolicyVersion(
  version: ExecutionPolicyVersion,
  ctx: PolicySelectionContext,
): number {
  const m: PolicyVersionMetrics = version.metrics;
  const latencyPenalty = Math.min(1, m.avgLatency / 60_000);
  let s =
    m.successRate * 0.35 +
    m.replayStability * 0.3 -
    m.anomalyRate * 0.2 -
    latencyPenalty * 0.15;

  if (ctx.replayBand === 'HIGH') {
    s += m.replayStability * 0.08;
  }
  if (ctx.latencyBudgetMs != null && m.avgLatency > 0) {
    const tight = ctx.latencyBudgetMs < 15_000;
    if (tight && m.avgLatency < ctx.latencyBudgetMs * 0.5) {
      s += 0.05;
    }
  }

  s += labelOverlapScore(version, ctx) * 0.05;
  return s;
}

export function selectPolicyVersion(
  candidates: ExecutionPolicyVersion[],
  ctx: PolicySelectionContext,
): ExecutionPolicyVersion | undefined {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestScore = scorePolicyVersion(best, ctx);
  for (let i = 1; i < candidates.length; i++) {
    const sc = scorePolicyVersion(candidates[i], ctx);
    if (sc > bestScore) {
      best = candidates[i];
      bestScore = sc;
    }
  }
  return best;
}
