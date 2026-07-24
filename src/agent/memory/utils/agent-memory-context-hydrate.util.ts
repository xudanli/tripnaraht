import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import {
  hydrateActiveRouteHealthSnapshot,
  hydrateRouteHealthByKey,
  routeHealthSnapshotKey,
} from './route-health-memory.util';
import { hydrateRecentTripFeedbacks } from './trip-feedback-memory.util';

/**
 * Redis JSON 反序列化后，还原 L3 字段的类型与索引键（Replay / Tier-1 基石）。
 */
export function hydrateAgentMemoryContextFromPersistence(
  raw: Partial<AgentMemoryContext>,
): Pick<
  AgentMemoryContext,
  | 'failurePatterns'
  | 'activeRouteHealthSnapshot'
  | 'routeHealthByKey'
  | 'recentTripFeedbacks'
  | 'observability'
> {
  const failurePatterns = Array.isArray(raw.failurePatterns)
    ? raw.failurePatterns.map((p) => String(p))
    : [];

  const routeHealthByKey = hydrateRouteHealthByKey(raw.routeHealthByKey);
  let activeRouteHealthSnapshot = hydrateActiveRouteHealthSnapshot(raw.activeRouteHealthSnapshot);

  if (activeRouteHealthSnapshot) {
    const canonicalKey = routeHealthSnapshotKey(
      activeRouteHealthSnapshot.routeDirectionId,
      activeRouteHealthSnapshot.countryCode,
    );
    if (routeHealthByKey[canonicalKey]) {
      activeRouteHealthSnapshot = routeHealthByKey[canonicalKey];
    }
  } else if (Object.keys(routeHealthByKey).length === 1) {
    activeRouteHealthSnapshot = routeHealthByKey[Object.keys(routeHealthByKey)[0]];
  }

  const observabilityRaw = raw.observability;
  const layers = Array.isArray(observabilityRaw?.layers) ? [...observabilityRaw.layers] : [];
  const metadataRaw = observabilityRaw?.metadata;
  const metadata =
    metadataRaw != null && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
      ? { ...(metadataRaw as Record<string, unknown>) }
      : undefined;

  return {
    failurePatterns,
    activeRouteHealthSnapshot,
    routeHealthByKey: Object.keys(routeHealthByKey).length > 0 ? routeHealthByKey : undefined,
    recentTripFeedbacks: hydrateRecentTripFeedbacks(raw.recentTripFeedbacks),
    observability: {
      layers,
      ...(metadata ? { metadata } : {}),
    },
  };
}

/** 模拟 Redis wire：persist → JSON.stringify → JSON.parse */
export function simulateRedisSnapshotRoundTrip(memory: AgentMemoryContext): AgentMemoryContext {
  const wire = JSON.stringify(memory);
  const parsed = JSON.parse(wire) as Partial<AgentMemoryContext>;
  const hydrated = hydrateAgentMemoryContextFromPersistence(parsed);
  return {
    ...(parsed as AgentMemoryContext),
    ...hydrated,
  };
}
