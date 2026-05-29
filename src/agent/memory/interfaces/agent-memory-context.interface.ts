// src/agent/memory/interfaces/agent-memory-context.interface.ts
import type { UserTravelProfile } from './user-travel-profile.interface';
import type { RouteDirectionDecisionMemory } from './route-direction-decision-memory.interface';
import type { TripTaskMemory, TripTaskRecoveryAuditLine } from '../../context-engine/interfaces/trip-task-memory.interface';
import type { DecisionMemory } from '../decision-memory/decision-memory.types';
import type { DecisionLedgerSnapshot, LedgerRecomputePlanV1 } from '../decision-ledger/decision-ledger.types';

/**
 * L0：设置页 / `UserProfile.preferences` 中的静态事实与显式偏好（与 L1 `UserTravelProfile` 分轨，装配层左连接）。
 */
export type AgentMemoryUserBasics = Readonly<{
  nationality?: string;
  residencyCountry?: string;
  tags?: readonly string[];
  preferredAttractionTypes?: readonly string[];
  dietaryRestrictions?: readonly string[];
  /** `user_profile` 行 `updatedAt`（ISO8601），供审计 */
  profilePreferencesUpdatedAt?: string;
}>;

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
  /** L0：`UserProfile.preferences` 扁平字段快照（国籍、标签、景点类型等）；无数据时为 null */
  userBasics: AgentMemoryUserBasics | null;
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

  loadedAt: string;
  observability: {
    layers: string[];
  };
}
