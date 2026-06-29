/**
 * route_and_run LLM 路由 / cost-aware 可观测 SSOT。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  getRouteAndRunRequestCost,
  type RouteAndRunRequestCostSnapshot,
} from './route-and-run-request-cost-accumulator.util';

export interface LlmRoutingObservabilityV1 {
  schemaId: 'tripnara.llm_routing@v1';
  version: 1;
  requested_provider: string;
  providers_used: string[];
  multi_provider_request: boolean;
  provider_switch_count: number;
  calls_by_provider: Array<{
    provider: string;
    tokens: number;
    cost_usd: number;
    calls: number;
  }>;
  total_cost_usd: number;
  total_tokens: number;
}

export interface LlmRoutingAdminProviderRowV1 {
  provider: string;
  cost_usd: number;
  tokens: number;
  calls: number;
  share_pct: number;
}

export interface LlmRoutingAdminSnapshotV1 {
  schemaId: 'tripnara.llm_routing_admin@v1';
  version: 1;
  source: 'db' | 'unavailable';
  series_days: number;
  providers: LlmRoutingAdminProviderRowV1[];
  total_cost_usd: number;
}

export function resolveRequestedLlmProvider(
  request: Pick<RouteAndRunRequestDto, 'options'>,
): string {
  return request.options?.llm_provider?.trim() || 'auto';
}

export function buildLlmRoutingObservabilityFromAccumulator(params: {
  request: Pick<RouteAndRunRequestDto, 'request_id' | 'options'>;
  snapshot?: RouteAndRunRequestCostSnapshot | null;
}): LlmRoutingObservabilityV1 | null {
  const snap =
    params.snapshot ?? getRouteAndRunRequestCost(params.request.request_id ?? '');
  if (!snap || snap.llmCallCount === 0) return null;

  const callsByProvider = Object.entries(snap.byProvider)
    .map(([provider, bucket]) => ({
      provider,
      tokens: bucket.tokens,
      cost_usd: Math.round(bucket.costUsd * 1_000_000) / 1_000_000,
      calls: bucket.calls,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const providersUsed = callsByProvider.map((r) => r.provider);

  return {
    schemaId: 'tripnara.llm_routing@v1',
    version: 1,
    requested_provider: resolveRequestedLlmProvider(params.request),
    providers_used: providersUsed,
    multi_provider_request: providersUsed.length > 1,
    provider_switch_count: snap.providerSwitchCount,
    calls_by_provider: callsByProvider,
    total_cost_usd: Math.round(snap.costUsd * 1_000_000) / 1_000_000,
    total_tokens: snap.totalTokens,
  };
}

export function buildLlmRoutingAdminSnapshot(params: {
  source: 'db' | 'unavailable';
  seriesDays: number;
  rows: Array<{ provider: string; cost_usd: number; tokens: number; calls: number }>;
}): LlmRoutingAdminSnapshotV1 {
  const totalCost = params.rows.reduce((s, r) => s + r.cost_usd, 0);
  return {
    schemaId: 'tripnara.llm_routing_admin@v1',
    version: 1,
    source: params.source,
    series_days: params.seriesDays,
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    providers: params.rows
      .map((r) => ({
        provider: r.provider,
        cost_usd: Math.round(r.cost_usd * 1_000_000) / 1_000_000,
        tokens: r.tokens,
        calls: r.calls,
        share_pct: totalCost > 0 ? Math.round((r.cost_usd / totalCost) * 10_000) / 100 : 0,
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd),
  };
}
