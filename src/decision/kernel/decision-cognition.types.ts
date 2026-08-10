/**
 * 决策编排上层认知契约（不替代工程阶段名）。
 *
 * 上层：看清现实 → 发现关系 → 聚焦问题 → 预演未来
 * 下层：INTAKE / RESEARCH / GATE / PLAN / VERIFY …
 *
 * 写入 DSO.`cognition`，作为后续 Gate / Plan / Narrator 的统一输入切片。
 */

/** Router 判定的认知深度（非所有请求都走满四步） */
export type DecisionDepth =
  | 'REALITY_ONLY'
  | 'REALITY_AND_RELATIONS'
  | 'FOCUSED_DECISION'
  | 'FULL_SIMULATION';

/** Trace 认知里程碑（与工程 step 并列观测） */
export type CognitionTraceMarker =
  | 'REALITY_READY'
  | 'RELATIONS_READY'
  | 'PROBLEM_FOCUSED'
  | 'FUTURE_SIMULATED'
  | 'DECISION_AUTHORIZED'
  | 'PLAN_APPLIED'
  | 'OUTCOME_RECONCILED';

export type SnapshotValidityStatus = 'VALID' | 'STALE' | 'DEGRADED' | 'UNKNOWN';

export interface SnapshotValidity {
  status: SnapshotValidityStatus;
  maxAgeSec?: number;
  reasons?: string[];
}

export interface EvidenceRef {
  id: string;
  kind?: string;
  source?: string;
  detail?: string;
}

export interface UnknownFact {
  id: string;
  question: string;
  blocking: boolean;
  relatedEntityIds?: string[];
}

/** 1. 看清现实 — 后续关系/问题/模拟的唯一现实输入 */
export interface RealitySnapshot {
  schema: 'tripnara/decision-reality-snapshot@v1';
  snapshotId: string;
  builtAt: string;
  /** 可选：对齐 Reality Kernel v0 */
  realityKernelSnapshotId?: string;

  tripState: {
    destination?: unknown;
    dates?: { start?: string; end?: string };
    itinerary?: unknown;
    vehicle?: unknown;
    members?: unknown;
    bookings?: unknown;
    planVersion?: number;
  };

  worldState: {
    weather?: unknown;
    roadStatus?: unknown;
    openingHours?: unknown;
    availability?: unknown;
    regulations?: unknown;
    physical?: unknown;
    human?: unknown;
    route?: unknown;
  };

  evidence: EvidenceRef[];
  unknowns: UnknownFact[];
  /** ROR / DSO 检出的事实冲突（可空；兼容旧消费者） */
  conflicts?: Array<{
    id: string;
    code: string;
    summary: string;
    severity?: 'HARD' | 'SOFT';
    evidenceRefs?: string[];
  }>;
  /** 一句话当前行程状态（四层投影用） */
  currentState?: string;
  freshness: SnapshotValidity;
  confidence: number;
}

export type RelationKind =
  | 'CAUSES'
  | 'CONSTRAINS'
  | 'DEPENDS_ON'
  | 'CONFLICTS_WITH'
  | 'AMPLIFIES'
  | 'MITIGATES';

export interface RealityEntity {
  id: string;
  kind: string;
  label?: string;
  attrs?: Record<string, unknown>;
}

export interface ImpactChain {
  id: string;
  steps: string[];
  summary: string;
  strength: number;
  evidenceRefs: string[];
}

export interface UncertaintyRelation {
  id: string;
  from: string;
  to: string;
  uncertainty: string;
  evidenceRefs: string[];
}

/** 2. 发现关系 — 事实→关系→影响链（收敛既有模块，非再调 LLM 总结） */
export interface RelationGraph {
  schema: 'tripnara/decision-relation-graph@v1';
  builtAt: string;
  nodes: RealityEntity[];
  edges: Array<{
    from: string;
    to: string;
    relation: RelationKind;
    strength: number;
    evidenceRefs: string[];
    detail?: string;
  }>;
  impactChains: ImpactChain[];
  uncertaintyLinks: UncertaintyRelation[];
}

export type FocusedProblemType =
  | 'INFEASIBILITY'
  | 'RISK'
  | 'PREFERENCE_CONFLICT'
  | 'OPPORTUNITY'
  | 'UNCERTAINTY';

/** 3. 聚焦问题 — Gate 评判的对象，而非「发现所有问题」的清单 */
export interface FocusedDecisionProblem {
  schema: 'tripnara/focused-decision-problem@v1';
  problemId: string;
  type: FocusedProblemType;
  question: string;
  rootCause: {
    entity?: string;
    relation?: RelationKind | string;
    evidenceRefs: string[];
    detail?: string;
  };
  affectedScope: {
    days?: string[];
    activities?: string[];
    members?: string[];
    bookings?: string[];
  };
  urgency: 'NOW' | 'TODAY' | 'BEFORE_TRIP' | 'LATER';
  severity: number;
  confidence: number;
  whyThisProblem: string;
  suppressedSecondaryProblems: string[];
  /** Gate 应对该聚焦问题的建议处置（由 GATE_EVAL 回填） */
  gateDisposition?: 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'REJECT';
  /**
   * 对外约束分层（验收清单）：
   * BLOCK / MUST_CONFIRM / SUGGEST_REPLACE / OPTIMIZE / WATCH
   */
  constraintLayer?:
    | 'BLOCK'
    | 'MUST_CONFIRM'
    | 'SUGGEST_REPLACE'
    | 'OPTIMIZE'
    | 'WATCH';
  /** 行动截止时间（ISO）；来自 early-warning / ERC */
  actionDeadline?: string | null;
}

export interface SimulatedFuture {
  id: string;
  label: string;
  planDraft?: unknown;
  scores?: {
    safety?: number;
    feasibility?: number;
    experience?: number;
    fatigue?: number;
    cost?: number;
    resilience?: number;
  };
  predictedRisks?: string[];
  evidenceRefs?: string[];
}

/** 4. 预演未来 — 多候选比较，而非单一 itinerary */
export interface FutureSimulationBundle {
  schema: 'tripnara/future-simulation-bundle@v1';
  builtAt: string;
  baseline: SimulatedFuture;
  alternatives: SimulatedFuture[];
  comparison: {
    safety?: number;
    feasibility?: number;
    experience?: number;
    fatigue?: number;
    cost?: number;
    resilience?: number;
  };
  recommendedAlternativeId?: string;
  verification: {
    status: 'PASS' | 'NEED_CONFIRM' | 'BLOCK';
    issues: Array<{ code?: string; class?: string; detail?: string }>;
  };
  predictionWindow?: {
    onset?: string;
    deterioration?: string;
    interventionDeadline?: string;
  };
  /** 预演结果是否需用户确认后才可写入 */
  requiresConfirmation?: boolean;
}

export type CognitionAdmissionPhase =
  | 'relations'
  | 'problem_focus'
  | 'future_simulation'
  | 'plan_write';

export interface CognitionAdmission {
  ok: boolean;
  missing: string[];
  marker?: CognitionTraceMarker;
  phase?: CognitionAdmissionPhase;
}

export interface CognitionAdmissionAuditEntry {
  phase: CognitionAdmissionPhase;
  ok: boolean;
  missing: string[];
  at: string;
}

/** DSO 认知四切片 */
export interface DecisionCognitionSlice {
  decisionDepth?: DecisionDepth;
  realitySnapshot?: RealitySnapshot;
  relationGraph?: RelationGraph;
  focusedProblem?: FocusedDecisionProblem;
  futureSimulation?: FutureSimulationBundle;
  /** 已达成的认知里程碑（观测用） */
  markers?: CognitionTraceMarker[];
  /** 最近一次各阶段准入审计（失败时 attach 会短路） */
  admissionAudit?: CognitionAdmissionAuditEntry[];
  updatedAt?: string;
}
