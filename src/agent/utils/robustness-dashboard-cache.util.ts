/**
 * Trip.metadata cache for last computed robustness dashboard (P1-B cold read).
 */

import type { RobustnessDashboardPayload } from '../utils/robustness-rollout-gateway.util';

export const ROBUSTNESS_DASHBOARD_METADATA_KEY = 'robustnessDashboardV1' as const;
export const ROBUSTNESS_DASHBOARD_REVISION_KEY = 'robustnessDashboardRevision' as const;

export interface RobustnessDashboardCacheEnvelope {
  schema: 'tripnara.robustness_dashboard@v1';
  dashboard: RobustnessDashboardPayload;
  cached_at: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseRobustnessDashboardRevisionFromTripMetadata(meta: Record<string, unknown>): number {
  const r = meta[ROBUSTNESS_DASHBOARD_REVISION_KEY];
  return typeof r === 'number' && Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
}

export function parseRobustnessDashboardCacheFromTripMetadata(
  raw: unknown,
): RobustnessDashboardCacheEnvelope | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schema !== 'tripnara.robustness_dashboard@v1') return undefined;
  const dashboard = raw.dashboard;
  if (!isRecord(dashboard)) return undefined;
  if (dashboard.schema !== 'tripnara.robustness_dashboard@v1') return undefined;
  if (typeof raw.cached_at !== 'string') return undefined;
  return raw as unknown as RobustnessDashboardCacheEnvelope;
}

export function serializeRobustnessDashboardCache(
  dashboard: RobustnessDashboardPayload,
): RobustnessDashboardCacheEnvelope {
  return {
    schema: 'tripnara.robustness_dashboard@v1',
    dashboard,
    cached_at: new Date().toISOString(),
  };
}

export function mergeRobustnessDashboardCacheIntoMetadata(
  prevMetadata: Record<string, unknown>,
  dashboard: RobustnessDashboardPayload,
): Record<string, unknown> {
  const rev = parseRobustnessDashboardRevisionFromTripMetadata(prevMetadata);
  return {
    ...prevMetadata,
    [ROBUSTNESS_DASHBOARD_METADATA_KEY]: serializeRobustnessDashboardCache(dashboard),
    [ROBUSTNESS_DASHBOARD_REVISION_KEY]: rev + 1,
  };
}
