// src/agent/memory/interfaces/agent-memory-context.interface.ts
import type { UserTravelProfile } from './user-travel-profile.interface';
import type { RouteDirectionDecisionMemory } from './route-direction-decision-memory.interface';
import type { TripTaskMemory, TripTaskRecoveryAuditLine } from '../../context-engine/interfaces/trip-task-memory.interface';
import type { DecisionMemory } from '../decision-memory/decision-memory.types';
import type { DecisionLedgerSnapshot, LedgerRecomputePlanV1 } from '../decision-ledger/decision-ledger.types';
import type { DomainInfluenceDigestV1, WishConstraintDigestV1, PrivateWishDigestV1, DecisionProfilingDigestV1, NegotiationDigestV1 } from './trip-intent-digest.types';

/** 单请求 route_and_run 显式提交的同行/体能（不写入 L1 DB；供本链路 Memory / TripPlanRequest 只读消费） */
export interface RouteRunPartyProfileSnapshot {
  fitness_level?: 'low' | 'medium' | 'high';
  risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  party_total?: number;
  has_children?: boolean;
  has_elderly?: boolean;
  mobility_note_zh?: string;
}

/**
 * 统一 Memory Contract：route_and_run / 决策 / 路线选择 共享只读视图。
 * 写入经 MemoryWritePipeline（事件总线），禁止业务侧随意 saveXXX。
 */
export interface AgentMemoryContext {
  /** 单次请求内不变；用于 audit / replay 锚定「当时依据哪份记忆」 */
  snapshotId: string;
  /** 单调版本；未来多阶段刷新 snapshot 时递增（当前固定 1） */
  snapshotVersion: number;

  requestId: string;
  userId: string | null;
  tripId: string | null;

  userProfile: UserTravelProfile | null;
  /** 从 L1 画像摘要出的偏好（供路由/策略快速消费） */
  travelPreference: Record<string, unknown> | null;

  /**
   * 本请求显式提交的同行/体能/risk（RouteAndRunRequestDto.party_profile / fitness_level / structured 内嵌）。
   * 不修改持久化 UserTravelProfile；下游与 trip.budgetConfig.travelers 等合并使用。
   */
  routePartyProfile: RouteRunPartyProfileSnapshot | null;

  recentDecisions: RouteDirectionDecisionMemory[];
  /**
   * v0：由 L2 路线决策 + 当前全局锚投影的决策账本；经锚漂移检测后可能含 INVALIDATED/STALE。
   */
  decisionLedger: DecisionLedgerSnapshot | null;
  /** 对 decisionLedger 中 INVALIDATED 节点的建议重算顺序（纯拓扑，不含具体重算实现）。 */
  ledgerRecomputePlan: LedgerRecomputePlanV1 | null;
  /**
   * 本 trip 在持久化归档中的近期世界侧决策（WDMA）；route_and_run 装载时拉取。
   * 与当次请求的 execution overlay（operational_negative_constraints）互补：后者是当前 request ring 热路径。
   */
  recentWorldDecisions: DecisionMemory[];
  activeTripState: TripTaskMemory | null;
  recoveryHistory: TripTaskRecoveryAuditLine[];
  /** L3/L4 演化占位：当前仅占位，避免各服务私拉字段 */
  failurePatterns: string[];

  /**
   * Trip 域投影：领域影响力治理摘要（主导者/权重/规则确认），供 replay 审计；不含私密愿望正文。
   * SoT 仍为 trip_domain_* 表；非 L1–L4 持久记忆。
   */
  domainInfluenceDigest: DomainInfluenceDigestV1 | null;
  /**
   * Trip 域投影：愿望单结构化约束聚合（must_do/must_avoid 等），不含愿望正文。
   */
  wishConstraintDigest: WishConstraintDigestV1 | null;

  /** 当前用户私密愿望清单摘要（仅本人条目正文，供决策参考）。 */
  privateWishDigest: PrivateWishDigestV1 | null;

  /** PDI-4 决策风格画像摘要（Travel Style / Money DNA / 摩擦预警）。 */
  decisionProfilingDigest: DecisionProfilingDigestV1 | null;

  /** 领域协商任务 + 三人格博弈 + 分摊共识摘要。 */
  negotiationDigest: NegotiationDigestV1 | null;

  loadedAt: string;
  observability: {
    layers: string[];
  };
}
