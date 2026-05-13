import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import type { UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';

/** 5.0 Budget Ledger：Leader → Member 的可选预算桶（建议额 + 硬熔断；货币单位与上游一致）。 */
export type ResearchBudgetBucket = Readonly<{
  target_amount: number;
  hard_limit: number;
}>;

/**
 * 5.0：Member → Leader 的财务反馈（结构化；不含自然语言解释）。
 * `estimated_cost` / `marginal_utility` 由各领域 Member 按可观测 Skill 输出填充。
 */
export type ResearchFinancials = Readonly<{
  scope: 'hotel' | 'flight' | 'transport' | 'destination' | 'compliance';
  estimated_cost: number;
  /** [0,1] 边际效用代理：多花钱带来的体验提升潜力（首版定义见酒店侧 util） */
  marginal_utility: number;
}>;

/** 5.0：Leader 预分桶表（按域注入 Assignment；键与 `ResearchFinancials.scope` 对齐）。 */
export type ResearchBudgetBucketsMap = Readonly<
  Partial<Record<ResearchFinancials['scope'], ResearchBudgetBucket>>
>;

/**
 * MAT 3.0+：Research Team 进程内总线载荷（按 requestId 分频道 + slotId 关联）。
 * Member 与 Leader 共用；后续可收紧为各域强类型。
 */
export type ResearchAssignmentPayload = Readonly<Record<string, unknown>>;

/** 并行域 Leader→Member 载荷（进程内引用传递，不经序列化）。 */
export const RESEARCH_PARALLEL_ASSIGNMENT_OP = 'parallel_member_run' as const;

export type ResearchParallelMemberKind = 'hotel' | 'flight' | 'destination';

export type ResearchParallelAssignmentPayload = {
  op: typeof RESEARCH_PARALLEL_ASSIGNMENT_OP;
  memberKind: ResearchParallelMemberKind;
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
  tripPlanRequest: NonNullable<PhaseExecutorContext['tripPlanRequest']>;
  researchAtomicRollbackSnapshot?: Record<string, unknown>;
  dso?: DecisionState;
  routeDirectionId?: string;
  userId?: string;
  itinerary?: PhaseExecutorContext['itinerary'];
  recentMessages?: string[];
  /** 4.0：并行酒店（及未来航班）总线载荷可选携带，供 Member Gossip */
  userCognitiveProfile?: UserCognitiveProfile;
  /** 6.x：心理账户快照（与 `ResearchMemberScopedCommerceInput` 对齐） */
  userEmotionalAccount?: UserEmotionalAccount;
  /** 5.0：可选预算桶，供 Member 感知与后续博弈 */
  budgetBucket?: ResearchBudgetBucket;
  /** 5.0.1：仲裁降级重跑 — 强制紧缩搜索偏好（与 `budgetRerunHints` 对齐） */
  budgetArbitrationHints?: Readonly<{ austerity_mode?: boolean }>;
};

export function isResearchParallelAssignmentPayload(p: ResearchAssignmentPayload): p is ResearchParallelAssignmentPayload {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as ResearchParallelAssignmentPayload).op === RESEARCH_PARALLEL_ASSIGNMENT_OP &&
    ((p as ResearchParallelAssignmentPayload).memberKind === 'hotel' ||
      (p as ResearchParallelAssignmentPayload).memberKind === 'flight' ||
      (p as ResearchParallelAssignmentPayload).memberKind === 'destination') &&
    typeof (p as ResearchParallelAssignmentPayload).researchData === 'object' &&
    (p as ResearchParallelAssignmentPayload).researchData !== null &&
    Array.isArray((p as ResearchParallelAssignmentPayload).evidenceRefs) &&
    typeof (p as ResearchParallelAssignmentPayload).tripPlanRequest === 'object' &&
    (p as ResearchParallelAssignmentPayload).tripPlanRequest !== null
  );
}

/** 串行 / pre_parallel 域：载荷含「当前已合并」的 workspace 快照。 */
export const RESEARCH_SEQUENTIAL_ASSIGNMENT_OP = 'sequential_member_run' as const;

export type ResearchSequentialMemberKind = 'transport' | 'compliance';

export type ResearchSequentialAssignmentPayload = {
  op: typeof RESEARCH_SEQUENTIAL_ASSIGNMENT_OP;
  memberKind: ResearchSequentialMemberKind;
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
  tripPlanRequest: NonNullable<PhaseExecutorContext['tripPlanRequest']>;
  /** 4.0：串行交通等载荷可选携带，供 Transport Gossip */
  userCognitiveProfile?: UserCognitiveProfile;
  /** 5.0：可选预算桶 */
  budgetBucket?: ResearchBudgetBucket;
};

export function isResearchSequentialAssignmentPayload(p: ResearchAssignmentPayload): p is ResearchSequentialAssignmentPayload {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as ResearchSequentialAssignmentPayload).op === RESEARCH_SEQUENTIAL_ASSIGNMENT_OP &&
    ((p as ResearchSequentialAssignmentPayload).memberKind === 'transport' ||
      (p as ResearchSequentialAssignmentPayload).memberKind === 'compliance') &&
    typeof (p as ResearchSequentialAssignmentPayload).researchData === 'object' &&
    (p as ResearchSequentialAssignmentPayload).researchData !== null &&
    Array.isArray((p as ResearchSequentialAssignmentPayload).evidenceRefs) &&
    typeof (p as ResearchSequentialAssignmentPayload).tripPlanRequest === 'object' &&
    (p as ResearchSequentialAssignmentPayload).tripPlanRequest !== null
  );
}

/** 单例 Member 订阅用：携带 requestId，与 per-request 频道同源发布。 */
export type ResearchAssignmentDispatchEnvelope = Readonly<{
  requestId: string;
  slotId: string;
  payload: ResearchAssignmentPayload;
}>;

/**
 * Member →Leader 显式合并单元（按域辨别联合，供权限校验与观测）。
 */
export type HotelScopedResearchPatch = Readonly<{
  scope: 'hotel';
  researchDataPartial: Readonly<Record<string, unknown>>;
  evidenceRefsAppended: readonly string[];
}>;

export type FlightScopedResearchPatch = Readonly<{
  scope: 'flight';
  researchDataPartial: Readonly<Record<string, unknown>>;
  evidenceRefsAppended: readonly string[];
}>;

export type DestinationScopedResearchPatch = Readonly<{
  scope: 'destination';
  researchDataPartial: Readonly<Record<string, unknown>>;
  evidenceRefsAppended: readonly string[];
}>;

export type TransportScopedResearchPatch = Readonly<{
  scope: 'transport';
  researchDataPartial: Readonly<Record<string, unknown>>;
  evidenceRefsAppended: readonly string[];
}>;

export type ComplianceScopedResearchPatch = Readonly<{
  scope: 'compliance';
  researchDataPartial: Readonly<Record<string, unknown>>;
  evidenceRefsAppended: readonly string[];
}>;

export type ScopedResearchPatch =
  | HotelScopedResearchPatch
  | FlightScopedResearchPatch
  | DestinationScopedResearchPatch
  | TransportScopedResearchPatch
  | ComplianceScopedResearchPatch;

/** Patch 域标签（并行 + 串行 Member）。 */
export type ResearchScopedPatchScope = ResearchParallelMemberKind | ResearchSequentialMemberKind;

/** @deprecated 使用 ScopedResearchPatch */
export type ResearchPatch = ScopedResearchPatch;

export type ResearchCompletionPayload = Readonly<{
  ok: boolean;
  error?: string;
  detail?: Readonly<Record<string, unknown>>;
  /** 成功且走总线时必需：显式 Scoped Patch */
  patch?: ScopedResearchPatch;
  /** 5.0：可选财务反馈（如酒店中位价估计） */
  financials?: ResearchFinancials;
}>;

export type ResearchAssignmentEnvelope = Readonly<{
  slotId: string;
  payload: ResearchAssignmentPayload;
}>;

export type ResearchCompletionEnvelope = Readonly<{
  slotId: string;
  payload: ResearchCompletionPayload;
}>;

export function isScopedResearchPatch(p: unknown): p is ScopedResearchPatch {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as ScopedResearchPatch;
  const scope = o.scope;
  if (
    scope !== 'hotel' &&
    scope !== 'flight' &&
    scope !== 'destination' &&
    scope !== 'transport' &&
    scope !== 'compliance'
  ) {
    return false;
  }
  if (typeof o.researchDataPartial !== 'object' || o.researchDataPartial === null) return false;
  return Array.isArray(o.evidenceRefsAppended);
}
