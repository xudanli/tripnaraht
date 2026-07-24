/**
 * route_and_run observability：统一解析 tokens_est / cost_est_usd。
 */

import {
  estimateUsdFromTokens,
  mountRouteAndRunEstimatedCostUsd,
  type RouteAndRunCostGovernanceCarrier,
} from './cost-governance-observability.util';
import { getRouteAndRunRequestCost } from './route-and-run-request-cost-accumulator.util';

export interface RouteAndRunCostEstInput {
  requestCarrier: RouteAndRunCostGovernanceCarrier;
  requestId?: string;
  orchestrationTotalCost?: number | null;
  agenticTotalTokens?: number | null;
  tokensEst?: number | null;
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function resolveRouteAndRunTokensEst(input: RouteAndRunCostEstInput): number {
  const agentic = input.agenticTotalTokens;
  if (agentic != null && agentic > 0) return Math.floor(agentic);

  const explicit = input.tokensEst;
  if (explicit != null && explicit > 0) return Math.floor(explicit);

  const requestId = input.requestId ?? input.requestCarrier.request_id;
  const acc = requestId ? getRouteAndRunRequestCost(requestId) : null;
  if (acc && acc.totalTokens > 0) return acc.totalTokens;

  return 0;
}

export function resolveRouteAndRunCostEstUsd(input: RouteAndRunCostEstInput): number {
  const mounted = input.requestCarrier.__routeAndRunEstimatedCostUsd;
  if (mounted != null && mounted > 0) return roundUsd(mounted);

  const requestId = input.requestId ?? input.requestCarrier.request_id;
  const acc = requestId ? getRouteAndRunRequestCost(requestId) : null;
  if (acc && acc.costUsd > 0) return roundUsd(acc.costUsd);

  const orchestration = input.orchestrationTotalCost;
  if (orchestration != null && orchestration > 0) return roundUsd(orchestration);

  const tokens = resolveRouteAndRunTokensEst(input);
  if (tokens > 0) return estimateUsdFromTokens(tokens);

  return 0;
}

export function enrichRouteAndRunCostInPlace(
  request: RouteAndRunCostGovernanceCarrier,
  input: Omit<RouteAndRunCostEstInput, 'requestCarrier'>,
): { costEstUsd: number; tokensEst: number } {
  const tokensEst = resolveRouteAndRunTokensEst({ ...input, requestCarrier: request });
  const costEstUsd = resolveRouteAndRunCostEstUsd({
    ...input,
    requestCarrier: request,
    tokensEst,
  });
  if (costEstUsd > 0) mountRouteAndRunEstimatedCostUsd(request, costEstUsd);
  return { costEstUsd, tokensEst };
}
