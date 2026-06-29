/**
 * Plan Studio 冲突中心 — 聚合读模型（P0-1 M2）
 */

import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import type {
  FeasibilityIssueDto,
  GateExecuteStatusDto,
} from './trip-constraint-solver.types';

export type PlanningConflictSource = 'feasibility' | 'schedule';

export type PlanningConflictCategory =
  | 'schedule'
  | 'transport'
  | 'team_fit'
  | 'access_capacity'
  | 'experience_expectation'
  | 'booking'
  | 'structure'
  | 'environment'
  | 'other';

export interface PlanningConflictItem {
  id: string;
  source: PlanningConflictSource;
  priority: FeasibilityIssueDto['priority'];
  category: PlanningConflictCategory;
  title: string;
  message: string;
  affectedDays?: number[];
  /** 与 feasibility dedupe 对齐的稳定键 */
  semanticKey?: string;
  /** 关联的 TripConstraint.id（官方规则 / legacy / POI 准入） */
  relatedConstraintIds?: string[];
  issue?: FeasibilityIssueDto;
  studioConflict?: ConflictDto;
}

export type PlanningDaySplitVariant = 'blue' | 'orange' | 'purple';

export interface PlanningDaySplitMemberDto {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface PlanningDaySplitSegmentDto {
  id: string;
  kind: 'shared' | 'branch' | 'rejoin';
  startTime: string;
  endTime?: string;
  /** 活动/节点名（如「冰川徒步」「专业向导集合点」） */
  title: string;
  /** POI / 地点名（如 Sólheimajökull、停车场 A） */
  placeName?: string;
  subtitle?: string;
  intensity?: 'high' | 'medium' | 'low';
  riskLevel?: 'low' | 'medium' | 'high';
  costPerPerson?: string;
  highlights?: string[];
}

export interface PlanningDaySplitBranchDto {
  id: string;
  groupId: string;
  groupLabel: string;
  memberCount: number;
  /** 组内成员（与 memberCluster 同源；无 Persona 分组时省略） */
  members?: PlanningDaySplitMemberDto[];
  variant?: PlanningDaySplitVariant;
  segments: PlanningDaySplitSegmentDto[];
}

export interface PlanningDaySplitDto {
  id: string;
  splitPlanId: string;
  dayIndex: number;
  dayNumber: number;
  title: string;
  dateLabel?: string;
  stats?: {
    splitDuration?: string;
    meetupTime?: string;
    feasibility?: string;
    satisfactionBadge?: string;
    /** 租车点 → B 组酒店距离（送达休息分流依据） */
    rentalHotel?: {
      distanceKm: number;
      driveMin: number;
      dropoffFeasible: boolean;
      rentalPlaceName: string;
      hotelPlaceName: string;
    };
  };
  /** 分叉锚点 — 中栏时间轴在此从 sharedBefore 拆成 branches */
  fork?: {
    startTime: string;
    afterSegmentId?: string;
  };
  sharedBefore: PlanningDaySplitSegmentDto[];
  branches: PlanningDaySplitBranchDto[];
  rejoin?: PlanningDaySplitSegmentDto;
  sharedAfter?: PlanningDaySplitSegmentDto[];
}

export interface PlanningConflictsSummary {
  total: number;
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
  byCategory: Record<string, number>;
}

/** includeDecisionChecker=1 时先返 conflicts，决策检查器异步补全 */
export interface DecisionCheckerDeferredDto {
  status: 'pending' | 'ready' | 'failed';
  taskId: string;
  pollUrl: string;
  error?: string;
  /** pending 时建议客户端轮询间隔（ms），避免 1s 内打满 */
  pollIntervalMs?: number;
}

export interface PlanningConflictsResponse {
  tripId: string;
  verdict?: {
    status: string;
    headline?: string;
  };
  gateExecute?: GateExecuteStatusDto;
  canStartExecute?: boolean;
  isStale?: boolean;
  /** feasibility-report 验证时间 */
  reportVerifiedAt?: string;
  /** schedule 冲突扫描时间 */
  conflictsGeneratedAt?: string;
  summary: PlanningConflictsSummary;
  conflicts: PlanningConflictItem[];
  /** P2：?includeConstraintsSummary=1 */
  constraintsSummary?: import('./constraints-summary.types').ConstraintsSummaryResponse;
  /** 决策检查器投影（异步就绪后附带；同步路径或 poll ready 时存在） */
  decisionChecker?: import('./decision-checker.types').DecisionCheckerResponse;
  /** includeDecisionChecker=1 首包：status=pending；poll 同路径带 decisionCheckerTaskId */
  decisionCheckerDeferred?: DecisionCheckerDeferredDto;
  /** 并行分流时间线（与 decisionChecker.splitPlan 通过 splitPlanId 关联） */
  daySplits?: PlanningDaySplitDto[];
}
