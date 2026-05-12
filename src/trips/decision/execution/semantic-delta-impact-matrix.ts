/**
 * Delta → 默认陈旧区域 / 域一致性矩阵（声明式，无运行时 mutation）
 *
 * 用途：校验生产者声明、推导 rebuild 边界说明；Phase 3 incremental 须与此矩阵对齐以免漂移。
 */

import type { SemanticDeltaEvent, SemanticDeltaKind } from './semantic-delta-event.types';
import type { SemanticImpactDomain, SemanticViewStaleRegion } from './semantic-impact.types';

/** 各 delta 类型在未声明 GLOBAL 时的默认陈旧切片 */
export const SEMANTIC_DELTA_KIND_STALE_REGIONS: Record<
  SemanticDeltaKind,
  readonly SemanticViewStaleRegion[]
> = {
  WEATHER_UPDATE: ['EXECUTION_BY_DATE', 'GLOBAL_ALERTS'],
  BOOKING_CONFLICT: ['EXECUTION_BY_DATE', 'TEMPORAL_PROPAGATION'],
  FATIGUE_ACCUMULATION: ['EXECUTION_BY_DATE'],
  ROUTE_DELAY: ['EXECUTION_BY_DATE', 'TEMPORAL_PROPAGATION', 'TEMPORAL_SCOPE'],
  ROAD_CONSTRAINT_CHANGE: [
    'EXECUTION_BY_DATE',
    'TEMPORAL_PROPAGATION',
    'TEMPORAL_SCOPE',
    'GLOBAL_ALERTS',
  ],
  SLOT_BLOCKED: [
    'EXECUTION_BY_DATE',
    'TEMPORAL_PROPAGATION',
    'TEMPORAL_SCOPE',
    'GLOBAL_ALERTS',
  ],
  SLOT_REPAIR_SUGGESTED: [
    'EXECUTION_BY_DATE',
    'TEMPORAL_PROPAGATION',
    'TEMPORAL_SCOPE',
    'GLOBAL_ALERTS',
  ],
  PARTIAL_REPLAN_EXECUTED: [
    'EXECUTION_BY_DATE',
    'TEMPORAL_PROPAGATION',
    'TEMPORAL_SCOPE',
    'GLOBAL_ALERTS',
  ],
  STREAMING_REPLAN: [
    'EXECUTION_BY_DATE',
    'TEMPORAL_PROPAGATION',
    'TEMPORAL_SCOPE',
    'GLOBAL_ALERTS',
  ],
  SELF_HEALING_STATE: [
    'EXECUTION_BY_DATE',
    'TEMPORAL_PROPAGATION',
    'TEMPORAL_SCOPE',
    'GLOBAL_ALERTS',
  ],
};

/** 各 kind 至少应声明的域（防止「打了标签但未声称影响结构」） */
export const SEMANTIC_DELTA_REQUIRED_DOMAIN: Record<
  SemanticDeltaKind,
  SemanticImpactDomain
> = {
  WEATHER_UPDATE: 'WEATHER',
  BOOKING_CONFLICT: 'BOOKING',
  FATIGUE_ACCUMULATION: 'TEMPORAL',
  ROUTE_DELAY: 'ROUTING',
  ROAD_CONSTRAINT_CHANGE: 'PHYSICAL',
  SLOT_BLOCKED: 'CONSTRAINT_FUSION',
  SLOT_REPAIR_SUGGESTED: 'CONSTRAINT_FUSION',
  PARTIAL_REPLAN_EXECUTED: 'CONSTRAINT_FUSION',
  STREAMING_REPLAN: 'CONSTRAINT_FUSION',
  SELF_HEALING_STATE: 'CONSTRAINT_FUSION',
};

/**
 * 由 delta kind + `impact` 推导陈旧区域。
 * `GLOBAL` 范围一律视为整快照失效（与受控 full rebuild 一致）。
 */
export function resolveSemanticStaleRegionsV0(
  delta: SemanticDeltaEvent,
): readonly SemanticViewStaleRegion[] {
  if (delta.impact.impactScope === 'GLOBAL') {
    return ['FULL_SNAPSHOT'];
  }
  const base = SEMANTIC_DELTA_KIND_STALE_REGIONS[delta.kind];
  return [...base];
}

export function validateSemanticDeltaImpactV0(
  delta: SemanticDeltaEvent,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const required = SEMANTIC_DELTA_REQUIRED_DOMAIN[delta.kind];
  if (!delta.impact.affectedDomains.includes(required)) {
    issues.push(
      `delta ${delta.kind} must include affectedDomains: '${required}'`,
    );
  }
  const { impactScope, affectedDates } = delta.impact;
  if (
    (impactScope === 'DAY' || impactScope === 'SLOT') &&
    (!affectedDates || affectedDates.length === 0)
  ) {
    issues.push(
      `impactScope ${impactScope} requires non-empty affectedDates`,
    );
  }
  return { ok: issues.length === 0, issues };
}
