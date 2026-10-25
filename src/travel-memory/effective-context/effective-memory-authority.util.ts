/**
 * ETC 消费权限 — Semantic Type 决定 authority，而非仅分类。
 * @see ADR-TRAVEL-MEMORY-RUNTIME · ETC 四纪律 #4
 */

import type {
  EffectiveMemoryAuthority,
  EffectiveMemoryItemV1,
  EffectiveMemoryLayer,
  TravelerMemorySemanticType,
} from './effective-traveler-context.types';

/** Semantic → 默认 authority（消费面） */
export function deriveEffectiveMemoryAuthority(
  semanticType: TravelerMemorySemanticType,
): EffectiveMemoryAuthority {
  switch (semanticType) {
    case 'CONSTRAINT':
      return 'CONSTRAINT';
    case 'PREFERENCE':
      return 'ADVISORY';
    case 'HABIT':
      return 'CONTEXT';
    case 'TRADEOFF':
      return 'UTILITY';
    case 'AVOIDANCE':
      return 'PENALTY';
    default: {
      const _exhaustive: never = semanticType;
      return _exhaustive;
    }
  }
}

/** Soft / Ranking：PREFERENCE · AVOIDANCE · TRADEOFF；CONSTRAINT 可 advisory 可见但不进硬约束 */
export function mayEnterSoftDecisionSurface(
  authority: EffectiveMemoryAuthority,
): boolean {
  return (
    authority === 'ADVISORY' ||
    authority === 'PENALTY' ||
    authority === 'UTILITY' ||
    authority === 'CONSTRAINT'
  );
}

/**
 * Hard / Injector：CONSTRAINT；L2/REQUEST 显式覆盖；L1 ADVISORY 兼容 DecisionParams。
 * HABIT(CONTEXT) / 纯 UTILITY·PENALTY 不经硬面画像。
 */
export function mayEnterHardDecisionSurface(item: {
  authority: EffectiveMemoryAuthority;
  layer: EffectiveMemoryLayer;
}): boolean {
  if (item.authority === 'CONTEXT') return false;
  if (item.authority === 'CONSTRAINT') return true;
  if (
    item.layer === 'L2_TRIP_OVERRIDE' ||
    item.layer === 'REQUEST_OVERLAY'
  ) {
    return true;
  }
  if (item.authority === 'ADVISORY') return true;
  return false;
}

/** ADR 决策向瘦字段：value / authority / confidence / provenance / sourceScope */
export function toEffectiveDecisionFacet(item: EffectiveMemoryItemV1): {
  value: unknown;
  authority: EffectiveMemoryAuthority;
  confidence: number;
  provenance: string[];
  sourceScope: EffectiveMemoryLayer;
  domain: EffectiveMemoryItemV1['domain'];
  semanticType: EffectiveMemoryItemV1['semanticType'];
  key: string;
} {
  return {
    value: item.value,
    authority: item.authority,
    confidence: item.confidence,
    provenance: item.sourceRefs,
    sourceScope: item.sourceScope,
    domain: item.domain,
    semanticType: item.semanticType,
    key: item.key,
  };
}
