/**
 * Harness Cost：route_and_run cost_governance observability + request carrier。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgenticTokenQuotaCheckResult } from './agentic-token-quota.util';
import { parseAgenticTokenQuotaConfig } from './agentic-token-quota.util';
import { resolveAgenticQuotaSessionId } from './agentic-session-quota-key.util';
import { resolveAgenticQuotaOrgId } from './agentic-org-quota-key.util';

export interface CostGovernanceObservabilityV1 {
  schemaId: 'tripnara.cost_governance@v1';
  version: 1;
  token_quota_enabled: boolean;
  user_daily_limit: number;
  org_daily_limit: number;
  global_daily_limit: number;
  session_token_cap: number;
  session_id: string | null;
  org_id: string | null;
  admission_scope: AgenticTokenQuotaCheckResult['scope'];
  tokens_used_in_scope: number;
  tokens_limit_in_scope: number;
  tokens_remaining_in_scope: number;
  admission_allowed: boolean;
  estimated_cost_usd: number | null;
}

export type RouteAndRunCostGovernanceCarrier = RouteAndRunRequestDto & {
  __agenticTokenQuotaCheckV1?: AgenticTokenQuotaCheckResult;
  __routeAndRunEstimatedCostUsd?: number | null;
};

export function mountAgenticTokenQuotaCheckOnRequest(
  request: RouteAndRunCostGovernanceCarrier,
  check: AgenticTokenQuotaCheckResult,
): void {
  request.__agenticTokenQuotaCheckV1 = check;
}

export function mountRouteAndRunEstimatedCostUsd(
  request: RouteAndRunCostGovernanceCarrier,
  usd: number | null | undefined,
): void {
  if (usd == null || !Number.isFinite(usd)) return;
  request.__routeAndRunEstimatedCostUsd = usd;
}

/** 粗算：默认 $0.002 / 1K tokens（DeepSeek-class 代理） */
export function estimateUsdFromTokens(
  tokens: number,
  usdPer1kTokens = 0.002,
): number {
  const n = Math.max(0, Math.floor(tokens));
  return Math.round((n / 1000) * usdPer1kTokens * 1_000_000) / 1_000_000;
}

export function buildCostGovernanceObservability(
  request: RouteAndRunCostGovernanceCarrier,
  env: NodeJS.ProcessEnv = process.env,
): CostGovernanceObservabilityV1 {
  const cfg = parseAgenticTokenQuotaConfig(env);
  const check = request.__agenticTokenQuotaCheckV1;
  const sessionId = resolveAgenticQuotaSessionId(request);
  const orgId = resolveAgenticQuotaOrgId(request);
  return {
    schemaId: 'tripnara.cost_governance@v1',
    version: 1,
    token_quota_enabled: cfg.enabled,
    user_daily_limit: cfg.perUserDaily,
    org_daily_limit: cfg.perOrgDaily,
    global_daily_limit: cfg.globalDaily,
    session_token_cap: cfg.perSessionCap,
    session_id: check?.session_id ?? sessionId,
    org_id: check?.org_id ?? orgId,
    admission_scope: check?.scope ?? 'none',
    tokens_used_in_scope: check?.used ?? 0,
    tokens_limit_in_scope: check?.limit ?? 0,
    tokens_remaining_in_scope: check?.remaining ?? 0,
    admission_allowed: check?.allowed ?? true,
    estimated_cost_usd: request.__routeAndRunEstimatedCostUsd ?? null,
  };
}

export function buildCostGovernanceAdminSnapshot(env: NodeJS.ProcessEnv = process.env): {
  token_quota_enabled: boolean;
  user_daily_limit: number;
  org_daily_limit: number;
  global_daily_limit: number;
  session_token_cap: number;
} {
  const cfg = parseAgenticTokenQuotaConfig(env);
  return {
    token_quota_enabled: cfg.enabled,
    user_daily_limit: cfg.perUserDaily,
    org_daily_limit: cfg.perOrgDaily,
    global_daily_limit: cfg.globalDaily,
    session_token_cap: cfg.perSessionCap,
  };
}
