/**
 * 规划工作台决策包 — P0 选项语义 + P1 决策簇
 * @see ARRANGE_ITINERARY_API.md § P6
 */

export type PlanningDecisionOptionKind =
  | 'SHIFT_EARLIER'
  | 'SHORTEN_STAY'
  | 'SHIFT_LATER'
  | 'ACCEPT_RISK';

/** 方案卡行项 — 预计结果 / 代价 */
export interface PlanningOptionLineItem {
  id: string;
  text: string;
  tone: 'good' | 'neutral' | 'caution';
}

/** 方案卡数据依据 — 底部证据条 */
export type PlanningOptionDataBasisIcon =
  | 'calendar'
  | 'route'
  | 'weather'
  | 'traffic'
  | 'history'
  | 'sensor';

export interface PlanningOptionDataBasis {
  id: string;
  label: string;
  icon: PlanningOptionDataBasisIcon;
  reliability?: 'high' | 'medium' | 'low';
  observedAt?: string;
}

export interface PlanningImpactScope {
  scope: 'DAY' | 'TRIP' | 'CANDIDATE_POOL' | 'ITEM';
  affectedDays: number[];
  itemIds: string[];
  candidateIds: string[];
  placeIds: number[];
}

export interface PlanningCounterfactualRow {
  id: string;
  label: string;
  dayIndex?: number;
  before: string;
  after: string;
  itemId?: string;
  placeId?: number;
}

export interface PlanningDecisionOption {
  id: string;
  optionKind: PlanningDecisionOptionKind;
  title: string;
  /** 方案卡主标题（如「提前 20 分钟离开起点」） */
  headline?: string;
  /** 方案卡副文案（如拥堵时段说明） */
  description?: string;
  /** 角标「方案 A」 */
  badge?: string;
  letter?: string;
  recommended?: boolean;
  /** 预计结果（兼容旧客户端） */
  outcomes: string[];
  /** 代价（兼容旧客户端） */
  costs: string[];
  /** 预计结果 — 结构化（含 tone，供方案卡渲染） */
  outcomeItems?: PlanningOptionLineItem[];
  /** 代价 — 结构化 */
  costItems?: PlanningOptionLineItem[];
  /** 数据依据 — 底部证据条 */
  dataBasis?: PlanningOptionDataBasis[];
  impactScope: PlanningImpactScope;
  counterfactualRows: PlanningCounterfactualRow[];
  action?: {
    type: 'apply_proposal' | 'copilot_action' | 'discard_proposal';
    proposalId?: string;
    payload?: Record<string, unknown>;
  };
}

export interface PlanningDiagnostic {
  id: string;
  code: string;
  message: string;
  severity: 'info' | 'warn' | 'block';
  dayIndex?: number;
  clusterId: string;
}

export interface PlanningDecisionCluster {
  id: string;
  title: string;
  summary: string;
  diagnosticCount: number;
  diagnostics: PlanningDiagnostic[];
  decisionId: string;
  dependsOn: string[];
  resolvesCount: number;
  options: PlanningDecisionOption[];
  priority: 'high' | 'medium' | 'low';
}

export interface PlanningExecutionStep {
  id: string;
  order: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  changeOperation?: string;
  itemId?: string;
  candidateId?: string;
  completedAt?: string;
}

export interface PlanningDecisionMonitor {
  validUntil: string;
  contextVersion: number;
  monitorWebhookUrl: string;
  pollIntervalMs?: number;
}

export interface PlanningDecisionPack {
  schema: 'tripnara.planning_decision_pack@v1';
  tripId: string;
  proposalId?: string;
  generatedAt: string;
  options: PlanningDecisionOption[];
  decisionClusters: PlanningDecisionCluster[];
  diagnostics: PlanningDiagnostic[];
  monitor: PlanningDecisionMonitor;
}

export interface PlanningProposalValidityView {
  proposalId: string;
  tripId: string;
  validUntil: string;
  contextVersion: number;
  isStale: boolean;
  staleReason?: string;
  monitorWebhookUrl: string;
  orchestrationPhase?: string;
}
