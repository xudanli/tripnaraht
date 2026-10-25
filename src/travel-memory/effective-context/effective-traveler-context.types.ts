/**
 * EffectiveTravelerContext — 规划/决策唯一应读的旅行者上下文。
 *
 * 冻结（ADR ETC 四纪律）：
 * 1) 纯投影 / read-only derived — 禁止写 Memory、晋升 Candidate、改 L1/L2
 * 2) 冲突优先级 — Explicit Trip Constraint > L2 > L1 Hard > Pref/Habit > Learned > Default
 * 3) 输出面向决策字段 — 禁止下游直读 8×5 Ontology 格子
 * 4) active ≠ 全生效 — 条目须带 value/authority/confidence/provenance/sourceScope
 *
 * 旧 Memory OS：过渡上游兼容输入，不是永久下游契约。
 *
 * @see ADR-TRAVEL-MEMORY-RUNTIME · Traveler Memory V1
 */

import type { TravelMemoryDecisionHintV1 } from '../context-assembly/selective-consume.util';

/** 八类长期记忆 Domain */
export type TravelerMemoryDomain =
  | 'FOOD'
  | 'STAY'
  | 'SLEEP'
  | 'MOBILITY'
  | 'EXPERIENCE'
  | 'PACE'
  | 'SPENDING'
  | 'DECISION_STYLE';

/** 五种记忆语义 */
export type TravelerMemorySemanticType =
  | 'PREFERENCE'
  | 'AVOIDANCE'
  | 'CONSTRAINT'
  | 'HABIT'
  | 'TRADEOFF';

/** 条目来自哪一层（产品 L0/L1/L2，非 Agent OS 编号） */
export type EffectiveMemoryLayer =
  | 'L1_PERSISTENT'
  | 'L2_TRIP_OVERRIDE'
  | 'L0_WORKING'
  | 'REQUEST_OVERLAY';

export type EffectiveMemoryOverridePolicy =
  | 'L2_WINS'
  | 'L1_ONLY'
  | 'L0_EPHEMERAL'
  | 'REQUEST_EPHEMERAL';

export type EffectiveMemorySensitivity = 'NORMAL' | 'SENSITIVE';

/**
 * 消费权限（由 Semantic 推导；决定硬/软面，而非仅数据分类）。
 * CONSTRAINT → 硬面；ADVISORY → 排序；CONTEXT → 仅上下文；
 * UTILITY → utility；PENALTY → 惩罚项。
 */
export type EffectiveMemoryAuthority =
  | 'CONSTRAINT'
  | 'ADVISORY'
  | 'CONTEXT'
  | 'UTILITY'
  | 'PENALTY';

/**
 * 单条有效记忆投影（纯投影；非新 Ledger 写入）。
 * ADR 决策向字段：value / authority / confidence / provenance(=sourceRefs) / sourceScope(=layer)。
 */
export type EffectiveMemoryItemV1 = {
  domain: TravelerMemoryDomain;
  semanticType: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  /** @deprecated 使用 sourceScope；保留兼容 */
  layer: EffectiveMemoryLayer;
  /** ADR sourceScope — 与 layer 同值 */
  sourceScope: EffectiveMemoryLayer;
  /** 消费权限；active ≠ 全生效 */
  authority: EffectiveMemoryAuthority;
  confidence: number;
  /** M1 全部为影子投影；ACTIVE 才可进生产决策 */
  status: 'SHADOW_PROJECTED';
  /** ADR provenance */
  sourceRefs: string[];
  overridePolicy: EffectiveMemoryOverridePolicy;
  sensitivity: EffectiveMemorySensitivity;
  /** 同 key 被 L2 覆盖时，保留被覆盖的 L1 引用 */
  overriddenByKey?: string;
};

/**
 * 解析后的旅行者有效上下文。
 * M1：默认 `SHADOW`。
 * M2：`EFFECTIVE_TRAVELER_CONTEXT_CONSUME=active` 时 prepareTick 标为 `ACTIVE`。
 */
export type EffectiveTravelerContextV1 = {
  schemaId: 'tripnara.effective_traveler_context@v1';
  version: 1;
  consumptionMode: 'SHADOW' | 'ACTIVE';
  subjectId: string | null;
  tripId: string | null;
  resolvedAt: string;
  items: EffectiveMemoryItemV1[];
  /** 同 domain 分组，便于 Profile Card / 调试 */
  byDomain: Partial<Record<TravelerMemoryDomain, EffectiveMemoryItemV1[]>>;
  /**
   * 冲突消解后的便捷投影（同 key 下 L2 > L1 > L0/REQUEST）。
   * M2 将以此驱动 DecisionParams，而非 Injector 直读 OS。
   */
  effective: {
    pace?: EffectiveMemoryItemV1;
    riskTolerance?: EffectiveMemoryItemV1;
    dietaryConstraints?: EffectiveMemoryItemV1;
    experienceInterests?: EffectiveMemoryItemV1;
    accommodationMovement?: EffectiveMemoryItemV1;
    planningStyle?: EffectiveMemoryItemV1;
    sleepQuality?: EffectiveMemoryItemV1;
  };
  /** 实际生效的 L2 override keys */
  tripOverridesApplied: string[];
  /**
   * TMR advisory hints 镜像（不改变线上 soft 路径；仅挂在 ETC 便于对照）。
   */
  advisoryHints: TravelMemoryDecisionHintV1[];
  provenance: {
    osProfilePresent: boolean;
    osBasicsPresent: boolean;
    osTravelPreferenceKeys: string[];
    tmrStructuredKeys: string[];
    tmrTripKeys: string[];
    itemCount: number;
    domainCount: number;
  };
  designPrinciple: string;
};

export const EFFECTIVE_TRAVELER_CONTEXT_DESIGN_PRINCIPLE =
  'Planner/CGUS/Recommendation must not read TMR Ledger or Memory OS directly; read EffectiveTravelerContext only.';

/** M3：软面 hints 对照 / 切换审计 */
export type EtcSoftHintsAuditV1 = {
  schemaId: 'tripnara.etc_soft_hints_audit@v1';
  version: 1;
  mode: 'off' | 'shadow' | 'active';
  softSource: 'tmr' | 'etc' | 'none';
  applied: boolean;
  etcHintKeys: string[];
  tmrHintKeys: string[];
  keysOnlyInEtc: string[];
  keysOnlyInTmr: string[];
  etcHintCount: number;
  tmrHintCount: number;
};

/** tick / response 可挂的瘦观测（避免把整份 items dump 进用户响应） */
export type EffectiveTravelerContextObservabilityV1 = {
  schemaId: 'tripnara.effective_traveler_context_obs@v1';
  version: 1;
  consumptionMode: 'SHADOW' | 'ACTIVE';
  subjectId: string | null;
  tripId: string | null;
  itemCount: number;
  domainCount: number;
  domains: TravelerMemoryDomain[];
  tripOverridesApplied: string[];
  effectiveKeys: string[];
  advisoryHintCount: number;
  provenance: EffectiveTravelerContextV1['provenance'];
  /** M2：Injector 消费模式（与 env 对齐） */
  consumeMode?: 'off' | 'shadow' | 'active';
  /** M3：软面 hints 对照 / 切换审计 */
  softHintsAudit?: EtcSoftHintsAuditV1;
};
