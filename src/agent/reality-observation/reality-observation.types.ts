/**
 * Reality Observation Runtime（ROR）P0 — 核心类型。
 *
 * Observe 交付物是 Reality Snapshot，不是 Prompt。
 * 三层：Observed Facts / Derived Facts / Latent Hypotheses（隐式≠事实）。
 */

import type { RealitySnapshot as DecisionRealitySnapshotV1 } from '../../decision/kernel/decision-cognition.types';

/** P0 六个观察任务 */
export const ROR_OBSERVATION_TASKS = [
  'DAY_EXECUTABILITY',
  'DAY_PACE',
  'ADD_ACTIVITY',
  'REPLACE_ACTIVITY',
  'ROUTE_EXECUTABILITY',
  'RISK_REPLAN',
] as const;

export type RorObservationTask = (typeof ROR_OBSERVATION_TASKS)[number];

export type ObservationAuthority =
  | 'OFFICIAL'
  | 'INTERNAL'
  | 'USER'
  | 'INFERRED';

export type ObservationNecessity = 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';

export type ObservationGapKind = 'FETCH' | 'DERIVE' | 'ASK_USER';

export type LatentUsagePolicy =
  | 'HINT'
  | 'RANKING_ONLY'
  | 'SOFT_CONSTRAINT'
  | 'CONFIRM_REQUIRED';

export type LatentScope =
  | 'MOMENT'
  | 'DAY'
  | 'TRIP'
  | 'DESTINATION'
  | 'LONG_TERM';

/** Registry 中的可观察能力项 */
export interface ObservationCapability {
  contextKey: string;
  domain:
    | 'TRIP_STATE'
    | 'TIMELINE'
    | 'SPATIAL'
    | 'MEMBER'
    | 'VEHICLE'
    | 'ROAD'
    | 'WEATHER'
    | 'EXPERIENCE'
    | 'BOOKING'
    | 'EXECUTION'
    | 'TEAM'
    | 'DECISION'
    | 'KNOWLEDGE'
    | 'EXTERNAL'
    | 'DERIVED';
  /** 映射到现有服务/取数白名单 */
  serviceKey:
    | 'TRIP'
    | 'ROUTE'
    | 'WEATHER'
    | 'ROAD'
    | 'BOOKING'
    | 'EXPERIENCE'
    | 'TEAM'
    | 'DERIVE'
    | 'USER';
  labelZh: string;
  /** 对齐 CRE 合同字段时的同源 key（可一对多） */
  creKeys?: string[];
  defaultFreshness?: string;
  /** 是否允许进入 Canonical（硬事实路径） */
  canonical: boolean;
}

export interface ObservationScope {
  tripId?: string | null;
  dayIndex?: number | null;
  activityRef?: string | null;
  routeRef?: string | null;
  page?: string | null;
  tripLifecycle?: string | null;
  planVersion?: number | null;
  message?: string;
}

export interface ObservationNeed {
  question: string;
  subject: string;
  contextKeys: string[];
  reason: string;
  necessity: ObservationNecessity;
  blocking: boolean;
  freshnessRequirement?: string;
  preferredSources?: string[];
  condition?: string;
}

export interface CompletionCriterion {
  id: string;
  description: string;
}

export interface ObservationPlan {
  operation: RorObservationTask;
  labelZh?: string;
  scope: ObservationScope;
  needs: ObservationNeed[];
  completionCriteria: CompletionCriterion[];
  /** CRE 安全底线注入的 keys（LLM 不可省略） */
  safetyFloorKeys: string[];
  maxReflectRounds: number;
}

export interface ObservedFact {
  key: string;
  value: unknown;
  scope: Record<string, unknown>;
  source: {
    provider: string;
    authority: ObservationAuthority;
  };
  observedAt: string;
  validUntil?: string;
  confidence: number;
  evidenceRef?: string;
}

export interface DerivedFact {
  key: string;
  value: unknown;
  derivedFrom: string[];
  method: string;
  observedAt: string;
  confidence: number;
}

export interface LatentHypothesis {
  id: string;
  key: string;
  value: unknown;
  scope: LatentScope;
  evidenceRefs: string[];
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  confidence: number;
  generatedBy: 'LLM' | 'RULE' | 'STATISTICAL_MODEL' | 'HYBRID';
  validFrom: string;
  validUntil?: string;
  usagePolicy: LatentUsagePolicy;
  status: 'CANDIDATE' | 'ACTIVE' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';
  /** 不得写入长期画像，除非显式晋升 */
  allowLongTermPromotion?: boolean;
}

export interface ObservationUnknown {
  key: string;
  question: string;
  gapKind: ObservationGapKind;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  blocking: boolean;
  canFetch: boolean;
  canDerive: boolean;
  mustAskUser: boolean;
  /** Reflect 闭环生成的追问话术 */
  askPromptZh?: string;
  askWhyZh?: string;
  suggestedAnswers?: string[];
  /** FETCH 失败后提升为请用户补充 */
  promotedFromFetch?: boolean;
}

export interface ObservationReflection {
  sufficientlyObserved: boolean;
  missingFacts: ObservationNeed[];
  conflictingFacts: string[];
  blockingUnknowns: string[];
  nextAction: 'FETCH_MORE' | 'ASK_USER' | 'FREEZE_SNAPSHOT' | 'ABORT';
  round: number;
}

/** Canonical = 可验证真相（Gate/Execute/ASK 只读此层） */
export interface CanonicalWorldState {
  observedFacts: ObservedFact[];
  derivedFacts: DerivedFact[];
}

/** Latent = 带证据的假设（不得 silently 并入 facts） */
export interface LatentWorldState {
  hypotheses: LatentHypothesis[];
}

/**
 * ROR 冻结快照：扩展字段 + 兼容 Decision RealitySnapshot v1 投影。
 */
export interface RorRealitySnapshot {
  schema: 'tripnara/decision-reality-snapshot@v1';
  snapshotId: string;
  observationId: string;
  operation: RorObservationTask;
  builtAt: string;
  scope: ObservationScope;
  /** 三层分离：隐式不得写入 observed */
  observedFacts: ObservedFact[];
  derivedFacts: DerivedFact[];
  latentHypotheses: LatentHypothesis[];
  /** 显式双世界视图（与上三层字段同步） */
  canonicalWorldState: CanonicalWorldState;
  latentWorldState: LatentWorldState;
  unknowns: ObservationUnknown[];
  evidence: Array<{ id: string; kind?: string; source?: string; detail?: string }>;
  confidence: number;
  tripVersion?: number;
  freshness: {
    status: 'VALID' | 'STALE' | 'DEGRADED' | 'UNKNOWN';
    maxAgeSec?: number;
    reasons?: string[];
  };
  /**
   * Gate 可读的 v1 兼容投影 —— **仅 Canonical**，禁止含 latent。
   */
  decisionSnapshot: DecisionRealitySnapshotV1;
  reflectRoundsUsed: number;
  nextActionAfterFreeze: 'PROCEED_TO_GATE' | 'ASK_USER' | 'ABORT';
  /** Reflect→ASK 闭环话术卡片（最多 3 条） */
  askCards?: Array<{
    key: string;
    promptZh: string;
    whyZh: string;
    suggestedAnswers?: string[];
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    gapKind: ObservationGapKind;
    blocking: boolean;
    promotedFromFetch?: boolean;
  }>;
  clarificationMessage?: string;
}

export interface RorSeedFacts {
  /** 已由上游装载的事实（key → value） */
  byKey?: Record<string, unknown>;
  tripVersion?: number;
  planVersion?: number;
}

export interface RorFetchHost {
  /** 按 serviceKey 拉取；P0 可返回 null 表示未接入 */
  fetchByServiceKey?(
    serviceKey: ObservationCapability['serviceKey'],
    contextKey: string,
    scope: ObservationScope,
  ): Promise<unknown | null>;
}
