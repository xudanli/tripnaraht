/**
 * 单次 route_and_run 请求内 LLM 用量内存累加（与 LlmUsageRecorder 同步）。
 */

export interface RouteAndRunProviderCostBucket {
  tokens: number;
  costUsd: number;
  calls: number;
}

export interface RouteAndRunRequestCostSnapshot {
  totalTokens: number;
  costUsd: number;
  llmCallCount: number;
  byProvider: Record<string, RouteAndRunProviderCostBucket>;
  providerSwitchCount: number;
}

function emptySnapshot(): RouteAndRunRequestCostSnapshot {
  return {
    totalTokens: 0,
    costUsd: 0,
    llmCallCount: 0,
    byProvider: {},
    providerSwitchCount: 0,
  };
}

export function recordRouteAndRunRequestCost(
  requestId: string,
  input: { totalTokens: number; costUsd: number; provider?: string | null },
): void {
  const id = requestId?.trim();
  if (!id) return;
  const prev = accumulators.get(id) ?? emptySnapshot();
  const provider = input.provider?.trim().toLowerCase() || 'unknown';
  const bucket = prev.byProvider[provider] ?? { tokens: 0, costUsd: 0, calls: 0 };
  const hadOtherProviders =
    Object.keys(prev.byProvider).length > 0 && !prev.byProvider[provider];
  accumulators.set(id, {
    totalTokens: prev.totalTokens + Math.max(0, Math.floor(input.totalTokens)),
    costUsd: prev.costUsd + Math.max(0, input.costUsd),
    llmCallCount: prev.llmCallCount + 1,
    byProvider: {
      ...prev.byProvider,
      [provider]: {
        tokens: bucket.tokens + Math.max(0, Math.floor(input.totalTokens)),
        costUsd: bucket.costUsd + Math.max(0, input.costUsd),
        calls: bucket.calls + 1,
      },
    },
    providerSwitchCount: prev.providerSwitchCount + (hadOtherProviders ? 1 : 0),
  });
}

export function getRouteAndRunRequestCost(requestId: string): RouteAndRunRequestCostSnapshot | null {
  const id = requestId?.trim();
  if (!id) return null;
  return accumulators.get(id) ?? null;
}

/** 测试 / 长生命周期进程防泄漏 */
export function clearRouteAndRunRequestCost(requestId: string): void {
  const id = requestId?.trim();
  if (!id) return;
  accumulators.delete(id);
}

export function resetRouteAndRunRequestCostAccumulatorsForTests(): void {
  accumulators.clear();
}

const accumulators = new Map<string, RouteAndRunRequestCostSnapshot>();
