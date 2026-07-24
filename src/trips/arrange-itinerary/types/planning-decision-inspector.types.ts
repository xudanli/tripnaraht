/**
 * 规划工作台决策检查器 — 四 Tab 统一读模型
 * @see ARRANGE_ITINERARY_API.md § 决策检查器
 */

import type { PlanningDecisionCausalChain } from './planning-causal-chain.types';
import type { PlanningDecisionBasis } from './planning-decision-basis.types';

export interface PlanningInspectorChangeRow {
  id: string;
  itemLabel: string;
  before: string;
  after: string;
  deltaLabel: string;
  deltaMinutes?: number;
}

export interface PlanningInspectorImpactTag {
  id: string;
  label: string;
  tone: 'good' | 'caution' | 'risk' | 'muted' | 'neutral';
}

export interface PlanningInspectorTimelineMilestone {
  id: string;
  label: string;
  originalTime?: string;
  newTime?: string;
  deltaMinutes?: number;
  /** 到下一里程碑的间隔（分钟）— 新计划轨 */
  durationAfterMinutes?: number;
  /** 原计划轨间隔；与 durationAfterMinutes 不同时填写（设计稿 63'→83'） */
  originalDurationAfterMinutes?: number;
}

export interface PlanningInspectorPlanDiff {
  optionId?: string;
  optionBadge?: string;
  optionTitle?: string;
  changeRows: PlanningInspectorChangeRow[];
  impactTags: PlanningInspectorImpactTag[];
  unchangedItems: string[];
  timelineCompare: {
    summary?: string;
    milestones: PlanningInspectorTimelineMilestone[];
    bannerText?: string;
  };
}

export interface PlanningInspectorMemberStance {
  memberId: string;
  displayName: string;
  role?: string;
  stance: 'support' | 'objection' | 'pending';
  comment?: string;
}

export interface PlanningInspectorMemberConsensus {
  summaryBar: string;
  supportCount: number;
  objectionCount: number;
  pendingCount: number;
  totalMembers: number;
  opinions: PlanningInspectorMemberStance[];
  aiSummary: string[];
  assessment: {
    supportPercent: number;
    objectionPercent: number;
    pendingPercent: number;
    statusMessage: string;
    canCreatorConfirm: boolean;
  };
  updatedAt?: string;
}

export interface PlanningInspectorGateCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'block';
}

export interface PlanningInspectorFeasibility {
  canSafelyWrite: boolean;
  headline: string;
  subheadline?: string;
  gateChecks: PlanningInspectorGateCheck[];
  validityWarning?: {
    message: string;
    retriggerCondition?: string;
  };
  executionSummary: Array<{
    id: string;
    label: string;
    value: string;
    icon: 'clock' | 'route' | 'users';
  }>;
  verdict: {
    status: 'feasible' | 'caution' | 'blocked';
    message: string;
    detail?: string;
  };
  validUntil?: string;
}

/** 决策空间（仅 problemId）vs 编排草案（proposalId） */
export type PlanningDecisionInspectorMode = 'problem' | 'proposal';

/** 各 Tab 是否无 BFF 数据 — 前端据此展示空态，勿用 fixture */
export interface PlanningInspectorTabEmptyState {
  causalChain: boolean;
  planDiff: boolean;
  memberConsensus: boolean;
  feasibility: boolean;
}

export interface PlanningDecisionInspector {
  schema: 'tripnara.planning_decision_inspector@v1';
  tripId: string;
  /** 编排草案模式 */
  proposalId?: string;
  /** 决策空间模式 — 与 decision-problems[].problemId 对齐 */
  problemId?: string;
  mode: PlanningDecisionInspectorMode;
  optionId?: string;
  generatedAt: string;
  refreshUrl: string;
  /** 无真实数据时为 true；前端应展示空态文案 */
  tabEmptyState: PlanningInspectorTabEmptyState;
  decisionBasis?: PlanningDecisionBasis;
  causalChain: PlanningDecisionCausalChain;
  planDiff: PlanningInspectorPlanDiff;
  memberConsensus: PlanningInspectorMemberConsensus;
  feasibility: PlanningInspectorFeasibility;
}
