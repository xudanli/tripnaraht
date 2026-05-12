import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { PolicyAgent } from '../contracts/policy-agent.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  buildPolicySelectionContext,
  type PolicySelectionContext,
} from './policy-version-selection.util';

/** Selection context extended with behavioral hints for specialization matching (MAPE). */
export interface PolicyAgentSelectionContext extends PolicySelectionContext {
  prefersSystem1?: boolean;
  prefersHeavyReasoning?: boolean;
}

export function buildPolicyAgentSelectionContext(
  ecpsCtx: ExecutionControlContext,
  request: RouteAndRunRequestDto,
): PolicyAgentSelectionContext {
  const base = buildPolicySelectionContext(ecpsCtx, request);
  const rh = ecpsCtx.routeHint;
  const prefersSystem1 = typeof rh === 'string' && rh.includes('SYSTEM1');
  const prefersHeavyReasoning =
    request.options?.use_claude_orchestration === true ||
    request.options?.use_state_machine_orchestration === true;

  return {
    ...base,
    prefersSystem1,
    prefersHeavyReasoning,
  };
}

function tagSet(agent: PolicyAgent): Set<string> {
  return new Set([agent.specialization.primary, ...agent.specialization.tags]);
}

/**
 * Scalar score for argmax over policy agents — combines ETK-derived fitness + specialization fit.
 */
export function scorePolicyAgent(agent: PolicyAgent, ctx: PolicyAgentSelectionContext): number {
  const f = agent.fitness;
  const latencyPenalty = Math.min(1, f.latency / 60_000);

  let s =
    f.successRate * 0.22 +
    f.replayStability * 0.2 +
    f.anomalyResistance * 0.18 +
    f.domainCoverage * 0.12 -
    latencyPenalty * 0.14;

  if (ctx.replayBand === 'HIGH') {
    s += f.replayStability * 0.06;
  }

  const tags = tagSet(agent);
  if (ctx.replayBand === 'HIGH' && tags.has('REPLAY_SAFE')) s += 0.07;
  if (ctx.latencyBudgetMs != null && ctx.latencyBudgetMs < 15_000 && tags.has('LOW_LATENCY')) {
    s += 0.06;
  }
  if (ctx.prefersSystem1 && tags.has('SYSTEM1_OPTIMAL')) s += 0.06;
  if (ctx.prefersHeavyReasoning && tags.has('SYSTEM2_REASONING')) s += 0.05;
  if (tags.has('HIGH_RELIABILITY')) s += 0.03;

  return s;
}

export function selectPolicyAgent(
  candidates: PolicyAgent[],
  ctx: PolicyAgentSelectionContext,
): PolicyAgent | undefined {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestScore = scorePolicyAgent(best, ctx);
  for (let i = 1; i < candidates.length; i++) {
    const sc = scorePolicyAgent(candidates[i], ctx);
    if (sc > bestScore) {
      best = candidates[i];
      bestScore = sc;
    }
  }
  return best;
}
