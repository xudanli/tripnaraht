/**
 * PRD 3.12 — 成团 sealed 后的 Trip 实例化策略（配置驱动）
 */

import type { TripInstantiationStrategy } from '../types/trip-instantiation.types';

export interface TripInstantiationStrategyRule {
  strategy: TripInstantiationStrategy;
  /** 按优先级排序，先命中先用 */
  priority: number;
  when: {
    hasTrekkingSpawnResult?: boolean;
    hasTrekkingOrchestrationLive?: boolean;
    hasRouteTemplateCatalog?: boolean;
  };
}

export const TRIP_INSTANTIATION_STRATEGY_RULES: readonly TripInstantiationStrategyRule[] = [
  {
    strategy: 'reuse_trekking_spawn',
    priority: 1,
    when: { hasTrekkingSpawnResult: true },
  },
  {
    strategy: 'trekking_spawn',
    priority: 2,
    when: { hasTrekkingOrchestrationLive: true },
  },
  {
    strategy: 'route_template',
    priority: 3,
    when: { hasRouteTemplateCatalog: true },
  },
  {
    strategy: 'minimal_trip',
    priority: 99,
    when: {},
  },
];

/** Vibe chip / toolchain → Active Trip 动态卡片 id */
export const TRIP_CONTEXTUAL_CARD_BINDINGS: Record<string, string> = {
  dem_blind_nav: 'offline_dem_pace_corridor',
  dem_digital_elevation: 'offline_dem_pace_corridor',
  dyl_life_design: 'dyl_canvas_evening',
  cooking_partner: 'trip_vault_ledger',
  vibe_coding: 'geek_quiet_dashboard',
  glacier_river_ford: 'ford_window_planner',
};

export function resolveInstantiationStrategy(input: {
  hasTrekkingSpawnResult: boolean;
  hasTrekkingOrchestrationLive: boolean;
  hasRouteTemplateCatalog: boolean;
}): TripInstantiationStrategy {
  const sorted = [...TRIP_INSTANTIATION_STRATEGY_RULES].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const w = rule.when;
    if (w.hasTrekkingSpawnResult && !input.hasTrekkingSpawnResult) continue;
    if (w.hasTrekkingOrchestrationLive && !input.hasTrekkingOrchestrationLive) continue;
    if (w.hasRouteTemplateCatalog && !input.hasRouteTemplateCatalog) continue;
    return rule.strategy;
  }
  return 'minimal_trip';
}

export function resolveContextualCardIds(vibeChipIds: string[], toolchainIds: string[]): string[] {
  const ids = new Set<string>();
  for (const chipId of vibeChipIds) {
    const card = TRIP_CONTEXTUAL_CARD_BINDINGS[chipId];
    if (card) ids.add(card);
  }
  for (const toolId of toolchainIds) {
    if (toolId === 'dyl_canvas_electronic') ids.add('dyl_canvas_evening');
    if (toolId === 'offline_gis_pack') ids.add('offline_dem_pace_corridor');
    if (toolId === 'shared_gear_checklist') ids.add('shared_gear_checklist');
  }
  return [...ids];
}
