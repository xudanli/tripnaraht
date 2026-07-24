/**
 * 前端决策卡片类型 — 与 backend planning-decision-pack.types.ts 对齐
 * 复制到前端 repo: src/features/planning-workbench/api/
 */

export type PlanningDecisionOptionKind =
  | 'SHIFT_EARLIER'
  | 'SHORTEN_STAY'
  | 'SHIFT_LATER'
  | 'ACCEPT_RISK';

export interface PlanningOptionLineItem {
  id: string;
  text: string;
  tone: 'good' | 'neutral' | 'caution';
}

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
  headline?: string;
  description?: string;
  badge?: string;
  letter?: string;
  recommended?: boolean;
  outcomes: string[];
  costs: string[];
  outcomeItems?: PlanningOptionLineItem[];
  costItems?: PlanningOptionLineItem[];
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

export interface CopilotSuggestion {
  id: string;
  kind: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  actionHint?: {
    method: 'GET' | 'POST';
    path: string;
    body?: Record<string, unknown>;
  };
  option?: PlanningDecisionOption;
}
