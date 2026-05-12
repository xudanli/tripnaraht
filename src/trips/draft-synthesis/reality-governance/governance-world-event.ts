import type { WorldBusEvent } from '../autonomous-world/world-bus-event.types';
import { WORLD_BUS_SUB } from '../autonomous-world/world-bus-semantic.builders';
import type { GovernanceTickResult } from './allocation.types';
import type { GovernancePolicyMode } from './governance-policy.types';

/**
 * 将治理 tick 结果压成总线事件，供 {@link reduceGlobalWorldState} 吸收资源压力信号。
 */
export function buildGovernanceTickWorldBusEvent(args: {
  result: GovernanceTickResult;
  mode: GovernancePolicyMode;
  /** 有分片键时才会抬升该城市的扰动/拥堵；缺省则仅推进全局时间轴 */
  cityKey?: string;
  timestamp?: number;
}): WorldBusEvent {
  let maxPressure = 0;
  for (const snap of Object.values(args.result.resourceSnapshots)) {
    const c = Math.max(snap.capacity, 1e-6);
    maxPressure = Math.max(maxPressure, Math.min(1, snap.currentLoad / c));
  }
  const cityKey = args.cityKey?.trim();
  return {
    kind: 'SYSTEM',
    subType: WORLD_BUS_SUB.GOVERNANCE_TICK,
    timestamp: args.timestamp ?? Date.now(),
    cityKey: cityKey && cityKey.length > 0 ? cityKey : undefined,
    payload: {
      maxPressure,
      outcomeCount: args.result.outcomes.length,
      mode: args.mode,
      resourceIdCount: Object.keys(args.result.resourceSnapshots).length,
    },
  };
}
