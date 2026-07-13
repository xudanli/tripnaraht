/** iOS 执行阶段 Mobile BFF 契约 — 对齐 Execution*ViewData */

import type { ActiveSosSnapshotDto } from './emergency-sos-active.dto';

export type MobileTripLifecycle = 'planning' | 'traveling' | 'completed' | 'cancelled';

export type MobileExecutionItemStatus =
  | 'completed'
  | 'inProgress'
  | 'upcoming'
  | 'delayed'
  | 'risk'
  | 'cancelled';

export type MobileMemberRole = 'leader' | 'member';
export type MobileMemberPresenceStatus = 'online' | 'warning' | 'offline';

export interface MobileContextSnapshotDto {
  trip: {
    id: string;
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
  };
  lifecycle: MobileTripLifecycle;
  contextVersion: number;
  planVersion?: number;
  activePlan: {
    id: string;
    version: number;
    title: string;
  } | null;
  members: Array<{
    id: string;
    displayName: string;
    role: MobileMemberRole;
    avatarUrl?: string | null;
  }>;
  decisions: Array<{
    id: string;
    title: string;
    status: 'pending' | 'accepted' | 'dismissed';
  }>;
  worldFacts: Array<{
    id: string;
    category: string;
    summary: string;
  }>;
  execution: {
    currentActivityID: string | null;
    nextActivityID: string | null;
    progressPercent: number;
    activeSOS?: ActiveSosSnapshotDto | null;
  } | null;
  readiness: unknown | null;
  notifications: Array<{
    id: string;
    category: string;
    title: string;
    createdAt: string;
  }>;
  generatedAt: string;
}

export interface MobileExecutionOverviewDto {
  tripName: string;
  dayLabel: string;
  lifecycleLabel: string;
  isExecuting: boolean;
  contextVersion: number;
  currentActivity: {
    title: string;
    subtitle: string;
    locationName: string;
    meetingPoint: string;
    meetingTime: string;
    estimatedArrival: string;
    remainingTime: string;
    progress: number;
    /** 当前活动/地点配图 — 来自 Place.metadata */
    imageUrl?: string | null;
    /** 行中位置摘要 — 如「204号公路 · 距营地 3.2km」 */
    currentLocationName?: string | null;
  };
  metrics: Array<{
    id: string;
    icon: string;
    title: string;
    value: string;
    detail: string;
  }>;
  team: {
    activeCount: number;
    totalCount: number;
    summary: string;
    note?: string;
    trackingDeviceCount: number;
    members: Array<{
      id: string;
      name: string;
      role: MobileMemberRole;
      status: MobileMemberPresenceStatus;
      avatarUrl?: string | null;
      alertTag?: string;
    }>;
  };
  statusRows: Array<{
    id: string;
    icon: string;
    title: string;
    badgeCount?: number;
    detail: string;
    progress?: number;
    style: 'risk' | 'adjustment' | 'progress';
  }>;
  quickActions: Array<{
    id: string;
    icon: string;
    title: string;
    isDestructive: boolean;
  }>;
  executionScore: number;
  executionScoreLabel: string;
  scoreBreakdown: Array<{
    id: string;
    label: string;
    value: string;
    style: 'success' | 'warning' | 'neutral';
  }>;
  aiInsight: {
    observation: string;
    impact: string;
    recommendation: string;
    executable: string;
  };
  /** lite=1 时为部分聚合，iOS 可展示 skeleton 后再拉完整总览 */
  meta?: {
    partial: boolean;
    skippedSections?: string[];
  };
}

export interface MobileTodayItineraryItemDto {
  id: string;
  time: string;
  endTime?: string;
  title: string;
  location?: string;
  duration?: string;
  experienceType?: string;
  memberCount?: number;
  impactNote?: string;
  status: MobileExecutionItemStatus;
  merchantName?: string;
  confirmationCode?: string;
}

export interface MobileTodayItineraryDto {
  dayTitle: string;
  contextVersion: number;
  warningTitle: string;
  warningDetail: string;
  warningImpact: string;
  warningRecommendation: string;
  items: MobileTodayItineraryItemDto[];
  activeItem: MobileTodayItineraryItemDto | null;
  participantCount: number;
  merchantName: string;
  confirmationCode: string;
}

export interface MobileLiveRouteDto {
  contextVersion: number;
  navInstruction: string;
  navDistance: string;
  navNext: string;
  eta: string;
  remaining: string;
  activityTitle: string;
  distanceToDestination: string;
  progress: number;
  teamSummary: string;
  teamNote: string;
  teamMembers: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  aiAlertTitle: string;
  aiAlertDetail: string;
  aiRecommendation: string;
  map: {
    coordinateOrder: 'latLng';
    polylines: Array<{
      id: string;
      coordinates: Array<[number, number]>;
      style: 'primary' | 'alternate' | 'completed';
    }>;
    markers: Array<{
      id: string;
      type: 'self' | 'teammate' | 'meeting' | 'destination';
      lat: number;
      lng: number;
      label?: string;
    }>;
    navigationSteps: Array<{
      instruction: string;
      distance: string;
      maneuver: string;
    }>;
  };
}

/** 执行预警层级 — 第一层：影响是否可继续执行 */
export type ExecutionAlertLevel = 'STOP' | 'REPLAN_REQUIRED' | 'AT_RISK';

export type ExecutionAlertPresentationRole = 'PRIMARY' | 'IMPACT' | 'INDEPENDENT';

export type ExecutionAlertRequiredAction = 'NONE' | 'REPLAN' | 'STOP' | 'ACKNOWLEDGE';

export type ExecutionAlertImpactType =
  | 'SAFETY'
  | 'ROUTE'
  | 'DELAY'
  | 'ITINERARY'
  | 'ACTIVITY'
  | 'CONSTRAINT';

export interface ExecutionAlertImpactDto {
  id: string;
  type: ExecutionAlertImpactType;
  label: string;
  sourceRiskId?: string;
}

/** 用户叙事 — 事实 → 影响 → 建议（见 EXECUTION-USER-NARRATIVE-CONTRACT.md） */
export interface ExecutionUserNarrativeAffectedActivityDto {
  label: string;
  time?: string;
}

export interface ExecutionUserNarrativeDto {
  whatHappened: string;
  impactOnTrip: string;
  recommendation: string;
  affected?: {
    activities?: ExecutionUserNarrativeAffectedActivityDto[];
    route?: string;
    reservation?: { label: string; time: string };
  };
}

export type ExecutionUserActionRole = 'primary' | 'secondary' | 'defer';

export interface ExecutionUserActionDto {
  label: string;
  action: ExecutionInterventionActionKind | 'view_impact' | 'confirm';
  actionId?: string;
  enabled: boolean;
  role: ExecutionUserActionRole;
}

export interface ExecutionAlertDto {
  id: string;
  /** 统一 Execution Risk Center riskId（与 id 相同） */
  riskId?: string;
  riskKey?: string;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  executionGate?: 'ALLOW' | 'AT_RISK' | 'REPLAN_REQUIRED' | 'STOP';
  acknowledgementStatus?: 'UNSEEN' | 'SEEN' | 'ACKNOWLEDGED' | 'SNOOZED';
  treatmentStatus?: string;
  recommendationIds?: string[];
  decisionProblemIds?: string[];
  presentationRole?: ExecutionAlertPresentationRole;
  parentRiskId?: string;
  riskType?: string;
  affectedRoute?: string;
  /** 一句可执行建议 — 与 reason 分离 */
  recommendedAction?: string;
  /** Observe → Explain → Suggest — 与 adjustment-queue items[].causalChain 同结构（仅 primaryRisk） */
  causalChain?: ExecutionInterventionCausalChainDto;
  level: ExecutionAlertLevel;
  title: string;
  reason: string;
  impact: string;
  affectedActivities: string[];
  evidenceRefs: string[];
  observedAt: string;
  requiresImmediateAttention: boolean;
  /** Phase B — 用户面四段叙事（优先于 title/reason 展示） */
  userNarrative?: ExecutionUserNarrativeDto;
  userActions?: ExecutionUserActionDto[];
}

/** @deprecated 使用 ExecutionAlertsDto — 保留类型别名供旧代码引用 */
export type MobileRiskAlertsDto = ExecutionAlertsDto;

export const EXECUTION_ALERTS_SCHEMA_V2_ID = 'tripnara.execution_alerts@v2';

export interface ExecutionAlertsDto {
  schemaId: 'tripnara.execution_alerts@v1' | 'tripnara.execution_alerts@v2';
  tripId: string;
  contextVersion: number;
  /** 投影来源 — execution_risk_center 表示来自统一活跃风险 Read Model */
  projectionSource?: 'legacy' | 'execution_risk_center' | 'execution_risk_center+attention_primary_sso';
  /** 页面顶部 banner — STOP / REPLAN_REQUIRED 时展示 */
  banner?: {
    level: ExecutionAlertLevel;
    title: string;
    detail: string;
  };
  requiredAction?: ExecutionAlertRequiredAction;
  primaryRisk?: ExecutionAlertDto;
  impacts?: ExecutionAlertImpactDto[];
  independentRisks?: ExecutionAlertDto[];
  /** v2：与 independentRisks 相同（不含 primary）；v1 曾含 PRIMARY + INDEPENDENT */
  alerts: ExecutionAlertDto[];
  aiRecommendation: {
    title: string;
    detail: string;
    evidenceIds: string[];
    basedOnRiskIds?: string[];
    headline?: string;
  };
}

/** 执行调整项类型 — 第二层「待调整事项」内部分类 */
export type ExecutionInterventionType =
  | 'SAFETY_INTERVENTION'
  | 'DYNAMIC_REPLAN'
  | 'TEAM_COORDINATION'
  | 'EXECUTION_PREPARATION';

export type ExecutionInterventionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ExecutionInterventionStatus =
  | 'OPEN'
  | 'SNOOZED'
  | 'ACCEPTED'
  | 'DISMISSED'
  | 'APPLYING'
  | 'RESOLVED'
  | 'FAILED'
  | 'EXPIRED';

export type ExecutionInterventionActionKind =
  | 'accept'
  | 'view_impact'
  | 'view_alternatives'
  | 'keep_original'
  | 'confirm'
  | 'complete'
  | 'notify_team'
  | 'snooze'
  | 'defer';

export interface ExecutionInterventionActionButtonDto {
  label: string;
  action: ExecutionInterventionActionKind;
  actionId?: string;
  enabled: boolean;
  count?: number;
}

export interface ExecutionInterventionActionsDto {
  primary: ExecutionInterventionActionButtonDto;
  secondary: ExecutionInterventionActionButtonDto;
  defer?: ExecutionInterventionActionButtonDto;
}

export type ExecutionInterventionCausalNodeType =
  | 'WORLD_CHANGE'
  | 'IMPACT'
  | 'CONFLICT'
  | 'OPTION'
  | 'OUTCOME';

export interface ExecutionInterventionCausalNodeDto {
  nodeId: string;
  type: ExecutionInterventionCausalNodeType;
  title: string;
  description: string;
  sourceRefs?: string[];
}

/** Observe → Explain → Suggest — 每个待调整项的因果链 */
export interface ExecutionInterventionCausalChainDto {
  headline: string;
  assessment: string;
  nodes: ExecutionInterventionCausalNodeDto[];
  recommendedOption?: {
    optionId: string;
    summary: string;
    expectedImprovement: string;
    tradeoff?: string;
  };
  traceId?: string;
  worldStateVersion?: string;
  technicalTraceRef?: string;
}

export interface ExecutionInterventionCausalTraceRefDto {
  traceId: string;
  worldStateVersion: string;
  protocolVersion: 'causal-trace-v1';
}

export interface ExecutionInterventionDto {
  schemaId: 'tripnara.execution_intervention@v1';
  id: string;
  tripId: string;
  type: ExecutionInterventionType;
  priority: ExecutionInterventionPriority;
  title: string;
  reason: string;
  affectedMembers: string[];
  affectedActivities: string[];
  recommendedAction: string;
  alternativeActions?: string[];
  actionDeadline?: string;
  evidenceRefs: string[];
  requiresConfirmation: boolean;
  autoExecutable: boolean;
  reversible: boolean;
  /** 确认后是否修改有效计划 */
  modifiesEffectivePlan: boolean;
  /** 修改后是否触发可执行性重验证 */
  requiresRevalidation: boolean;
  status: ExecutionInterventionStatus;
  /** 复杂调整项关联 DecisionProblem */
  decisionProblemId?: string;
  /** 关联 Execution Risk Center riskId（可多对多） */
  linkedRiskIds?: string[];
  linkedRiskKeys?: string[];
  primaryRiskId?: string;
  /** 环境风险建议 — 对应 execution-risks recommendations */
  recommendationId?: string;
  environmentEventId?: string;
  actions: ExecutionInterventionActionsDto;
  /** 因果链 — 卡片「为什么重要」的数据源 */
  causalChain: ExecutionInterventionCausalChainDto;
  /** 安全干预项可选 Abu 视角叙事 */
  guardianCausalChain?: ExecutionInterventionCausalChainDto;
  causalTraceRef?: ExecutionInterventionCausalTraceRefDto;
  recommendation?: {
    title: string;
    summary?: string;
    keeps: string[];
    costs: string[];
    recommendedActionId?: string;
    /** TEP Local Repair — effective PlanVersion when preview was rendered */
    basePlanVersionId?: string;
  };
  /** 风险簇 ID — 同一根因事件聚合后的稳定标识 */
  clusterId?: string;
  /** 根因后果列表 — 供「影响」区块渲染，避免多张并列风险卡 */
  consequenceImpacts?: Array<{
    code: string;
    label: string;
    sourceRiskId?: string;
  }>;
  /** 成员影响范围表达：全员 vs 重点成员 */
  affectedMembersScope?: 'ALL_MEMBERS' | 'FOCUSED';
  /** Phase B — 用户面四段叙事（优先于 title/reason 展示） */
  userNarrative?: ExecutionUserNarrativeDto;
  userActions?: ExecutionUserActionDto[];
}

/** @deprecated 使用 ExecutionAdjustmentQueueDto */
export type MobilePendingAdjustmentsDto = ExecutionAdjustmentQueueDto;

export interface ExecutionAdjustmentQueueDto {
  schemaId: 'tripnara.execution_adjustment_queue@v1';
  tripId: string;
  contextVersion: number;
  projectionSource?: 'legacy' | 'execution_risk_center' | 'execution_risk_center+attention_primary_sso';
  /** 产品页「待处理 N」角标 */
  pendingCount: number;
  criticalCount: number;
  highPriorityCount: number;
  headline: string;
  items: ExecutionInterventionDto[];
  /** 按类型分组计数 */
  countsByType: Record<ExecutionInterventionType, number>;
  linkedActiveRiskCount?: number;
  /** 风险簇摘要 — 供调试 / 前端理解聚合关系，不替代 items[] */
  riskClusters?: Array<{
    clusterId: string;
    primaryRiskId: string;
    relatedRiskIds: string[];
    rootCauseCode: string;
    severity: string;
    adjustmentType: ExecutionInterventionType;
    consequenceCount: number;
  }>;
  generatedAt?: string;
}

export interface MobileTeamStatusDto {
  members: Array<{
    id: string;
    name: string;
    role: MobileMemberRole;
    status: MobileMemberPresenceStatus;
    avatarUrl?: string | null;
    batteryPercent?: number;
    distanceToMeeting?: string | null;
    distanceToCurrentUserMeters?: number | null;
    distanceToCurrentUserLabel?: string | null;
    lastUpdateAt: string;
    alertTag?: string;
  }>;
  groups?: Array<{
    name: string;
    meetingPoint: string;
    memberIds: string[];
  }>;
}

export interface MobileRoadConditionsDto {
  contextVersion: number;
  alertTitle: string;
  alertDetail: string;
  timeline: Array<{
    time: string;
    event: string;
    severity: string;
  }>;
  evidence: Array<{
    id: string;
    source: string;
    detail: string;
    updatedAt: string;
    confidence?: number;
    sourceURL?: string;
    publisher?: string;
    title?: string;
    publishedAt?: string;
    retrievedAt?: string;
    relation?: string;
    citation?: string;
  }>;
}

export interface MobileMeetingPointDto {
  contextVersion: number;
  id: string;
  name: string;
  lat: number;
  lng: number;
  advisedArrivalTime: string;
  description: string;
  instructions: string[];
  participants: Array<{
    memberId: string;
    name: string;
    eta: string;
    status: string;
  }>;
  syncCount: number;
}

export interface MobileNavigationSessionDto {
  id: string;
  activityId: string;
  destinationId: string;
  shareWithTeam: boolean;
  startedAt: string;
  startedBy: string;
}

export type MobileIntercomWriteMessageType = 'voice' | 'text';

export interface MobileIntercomMessageResultDto {
  contextVersion: number;
  message: {
    id?: string;
    clientId: string;
    type: MobileIntercomWriteMessageType;
    body: string;
    transcript?: string;
    transcriptId?: string;
    durationSec?: number;
    durationSeconds?: number;
    sentAt?: string;
    deliveryStatus?: 'sent' | 'local_pending';
    audioUrl?: string;
    serverSeq?: number;
  };
  replay: boolean;
  previewSummary?: string;
}
