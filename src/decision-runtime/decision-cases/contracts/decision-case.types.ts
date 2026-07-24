/**
 * DecisionCase product contract — published problems + opportunity inbox.
 * FE 决策空间只绑 published problems；opportunities 默认不进队列。
 */

import type {
  ConstraintEnforcement,
  DecisionOption,
  DecisionProblemStatus,
  DecisionProblemType,
  TradeoffDimension,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { DecisionDimension } from '../../gateway/contracts/unified-decision-ui.types';

export type DecisionCaseSourceKind =
  | 'REQUIRED_CHOICE'
  | 'RULE_TRIGGER'
  | 'OPPORTUNITY'
  | 'WORLD_EVENT';

export type DecisionCaseRequiredness = 'BLOCKING' | 'IMPORTANT' | 'OPTIONAL';

export type DecisionCaseScope = 'TRIP' | 'DAY' | 'SEGMENT' | 'ACTIVITY';

export type DecisionCaseActionKind =
  | 'SELECT'
  | 'CONFIRM'
  | 'SPLIT'
  | 'REPLACE'
  | 'BOOK'
  | 'DEFER';

export type DecisionCaseDomain =
  | 'TRANSPORT'
  | 'INSURANCE'
  | 'ROUTE'
  | 'LODGING'
  | 'EXPERIENCE'
  | 'SCHEDULE'
  | 'TEAM'
  | 'BOOKING'
  | 'WEATHER'
  | 'SAFETY';

export type DecisionCaseWritebackTarget =
  | 'VEHICLE'
  | 'INSURANCE'
  | 'ROUTE'
  | 'LODGING'
  | 'ITINERARY'
  | 'BOOKING_INTENT';

export type DecisionCaseEnrichmentStage = 'SHELL' | 'ENRICHED';

export type DecisionCaseUiGroup =
  | 'MUST_CONFIRM'
  | 'IMPORTANT_CHOICE'
  | 'WORTH_CONSIDERING';

/** FE 展示文案（由 uiGroup 映射，勿把中文当枚举值） */
export const DECISION_CASE_UI_GROUP_LABEL_ZH: Record<DecisionCaseUiGroup, string> = {
  MUST_CONFIRM: '必须确认',
  IMPORTANT_CHOICE: '关键选择',
  WORTH_CONSIDERING: '值得考虑',
};

export interface DecisionMaterialityBreakdown {
  budget: number;
  time: number;
  safety: number;
  fitness: number;
  team: number;
  bookingUrgency: number;
  irreversibility: number;
}

export interface DecisionMaterialityScore {
  total: number;
  breakdown: DecisionMaterialityBreakdown;
}

export type DecisionTriggerType =
  | 'TRIP_CREATED'
  | 'ROUTE_INTERSECTION'
  | 'PROFILE_MATCH'
  | 'PLAN_IMPACT'
  | 'BOOKING_URGENCY'
  | 'WORLD_EVENT';

/** Eligibility 检查摘要（FE / 机会箱可读） */
export interface DecisionEligibilitySnapshot {
  eligible: boolean;
  reason?: string;
  softWarnings: string[];
  checks: Array<{
    code: string;
    dimension: string;
    passed: boolean;
    detail: string;
  }>;
  eligibleOptionIds?: string[];
}

/** 未过门槛 — 不进 decision-problems */
export interface DecisionOpportunityCandidate {
  opportunityId: string;
  tripId: string;
  triggerType: DecisionTriggerType;
  subjectRef: string;
  evidenceRefs: string[];
  title: string;
  summary: string;
  domain: DecisionCaseDomain;
  materiality: DecisionMaterialityScore;
  eligible: boolean;
  ineligibilityReason?: string;
  /** 三闸 Eligibility 完整快照（体能/年龄/资格） */
  eligibility?: DecisionEligibilitySnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface StoredDecisionCaseOption {
  optionId: string;
  type: DecisionOption['type'];
  title: string;
  description: string;
  tradeoffs: TradeoffDimension[];
  requiresConfirmation: boolean;
  executable?: boolean;
  /** 写回 payload — apply 时落 trip 约束 */
  writebackPayload?: Record<string, unknown>;
}

export interface StoredDecisionCase {
  problemId: string;
  tripId: string;
  semanticKey: string;
  sourceKind: DecisionCaseSourceKind;
  requiredness: DecisionCaseRequiredness;
  domain: DecisionCaseDomain;
  scope: DecisionCaseScope;
  actionKind: DecisionCaseActionKind;
  materiality: DecisionMaterialityScore;
  enrichmentStage: DecisionCaseEnrichmentStage;
  published: boolean;
  writebackTargets: DecisionCaseWritebackTarget[];
  title: string;
  summary: string;
  type: DecisionProblemType;
  dimension: DecisionDimension;
  enforcement: ConstraintEnforcement;
  workflowStatus: DecisionProblemStatus;
  options: StoredDecisionCaseOption[];
  evidenceRefs: string[];
  opportunityId?: string;
  /** 发布时固化的 Eligibility（体验卡必填） */
  eligibility?: DecisionEligibilitySnapshot;
  createdAt: string;
  updatedAt: string;
  resolvedOptionId?: string;
  resolvedAt?: string;
}

export interface DecisionCaseProductProjection {
  sourceKind: DecisionCaseSourceKind;
  requiredness: DecisionCaseRequiredness;
  domain: DecisionCaseDomain;
  scope: DecisionCaseScope;
  actionKind: DecisionCaseActionKind;
  materialityScore: number;
  materialityBreakdown: DecisionMaterialityBreakdown;
  enrichmentStage: DecisionCaseEnrichmentStage;
  writebackTargets: DecisionCaseWritebackTarget[];
  /** 枚举：MUST_CONFIRM | IMPORTANT_CHOICE | WORTH_CONSIDERING */
  uiGroup: DecisionCaseUiGroup;
  /** 中文分组文案 */
  uiGroupLabelZh: string;
  /** 体能/资格 Eligibility（有则下发） */
  eligibility?: DecisionEligibilitySnapshot;
}

export interface DecisionOpportunityListView {
  schemaId: 'tripnara.decision_opportunities@v1';
  tripId: string;
  generatedAt: string;
  meta: {
    total: number;
    eligibleCount: number;
  };
  items: DecisionOpportunityCandidate[];
}

export interface DecisionCaseStoreState {
  byProblemId: Record<string, StoredDecisionCase>;
  opportunitiesById: Record<string, DecisionOpportunityCandidate>;
}

export const DECISION_CASE_METADATA_KEY = 'decisionCases';

/** 保险硬约束：涉水过河损坏 ≠ 普通保险可覆盖 */
export const INSURANCE_FORDING_EXCLUSION_NOTE =
  'SafeTravel：车辆涉水过河造成的损坏通常不属于普通租车保险覆盖范围；买全险仍不可放心过河。';
