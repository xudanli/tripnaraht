import type { GlobalConflict } from './global-conflict.types';

export type RebalanceAction =
  | { action: 'STAGGER_SLOT'; tripId: string; hint: string }
  | { action: 'REROUTE_POI'; tripId: string; placeId: number; hint: string }
  | { action: 'GLOBAL_RE_EVALUATE_PARETO'; tripIds: string[]; hint: string };

/**
 * 冲突 → 可执行动作占位（后续接 World Orchestrator / 局部重规划）。
 * 不做真实求解，仅给出工程可跟进的指令集。
 */
export function proposeRebalanceActions(conflicts: GlobalConflict[]): RebalanceAction[] {
  const actions: RebalanceAction[] = [];
  for (const c of conflicts) {
    if (c.type === 'POI_OVERLOAD') {
      for (const tid of c.tripIds) {
        actions.push({
          action: 'STAGGER_SLOT',
          tripId: tid,
          hint: '错开时段或替换备选 POI',
        });
      }
      actions.push({
        action: 'GLOBAL_RE_EVALUATE_PARETO',
        tripIds: [...c.tripIds],
        hint: '多行程竞争同一 POI，触发前沿再评估',
      });
    }
    if (c.type === 'AREA_HOTSPOT') {
      actions.push({
        action: 'GLOBAL_RE_EVALUATE_PARETO',
        tripIds: [...c.tripIds],
        hint: '同城同时段走廊拥挤，触发错峰或替换局部时段',
      });
    }
  }
  return actions;
}
