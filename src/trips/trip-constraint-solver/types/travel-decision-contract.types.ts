/**
 * 旅行决策合同 — 约束控制台 SSOT（用户目标、边界、妥协与自动化授权）
 * @see CONSTRAINT_SEMANTIC_CONSOLIDATION.md §2.2 ConstraintPolicy
 */

import type { ObjectiveFunctionWeights } from '../../decision/optimization/objective-function.interface';
import type { CanonicalObjectiveId } from '../../../decision-runtime/contracts/objective-definition';
import type { TripConstraint } from './trip-constraint.types';

/** 用户可见的旅行原则（可排序 → 多目标权重） */
export const TRAVEL_PRINCIPLE_KEYS = [
  'SAFETY',
  'PACE',
  'CORE_EXPERIENCE',
  'BUDGET',
  'FEWER_HOTEL_CHANGES',
  'FLEXIBILITY',
  'COVERAGE',
  'PHOTOGRAPHY',
  'FAMILY_COMFORT',
] as const;

export type TravelPrincipleKey = (typeof TRAVEL_PRINCIPLE_KEYS)[number];

export const TRAVEL_PRINCIPLE_LABELS: Record<TravelPrincipleKey, string> = {
  SAFETY: '安全第一',
  PACE: '行程轻松',
  CORE_EXPERIENCE: '核心体验优先',
  BUDGET: '预算优先',
  FEWER_HOTEL_CHANGES: '少换住宿',
  FLEXIBILITY: '保留弹性',
  COVERAGE: '尽可能多看',
  PHOTOGRAPHY: '摄影体验优先',
  FAMILY_COMFORT: '老人儿童体验优先',
};

export interface TravelObjectiveProfile {
  /** 排序后的原则（靠前 = 更高优化权重） */
  rankedPrinciples: TravelPrincipleKey[];
  version: number;
  updatedAt?: string;
}

export type SoftConstraintPriorityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export type ChangeStrategyArchetype = 'CONSERVATIVE' | 'BALANCED' | 'EXPLORATORY';

export interface ChangeStrategyTolerances {
  maxBudgetOverrunPct?: number;
  maxDelayMinutes?: number;
  maxPoiRemovals?: number;
  allowTemporaryLodgingChange?: boolean;
  allowSameDayReroute?: boolean;
  acceptLowConfidencePlans?: boolean;
}

export interface ChangeStrategyProfile {
  archetype: ChangeStrategyArchetype;
  tolerances: ChangeStrategyTolerances;
}

export type AutomationLevel =
  | 'INFORM_ONLY'
  | 'SUGGEST'
  | 'AUTO_REPAIR_LOW_RISK'
  | 'AUTO_EXECUTE_CONDITIONAL';

/** 与 automation-action.catalog 对齐 */
export type AutomationPermissionTier = 'AUTO' | 'ASK' | 'DENY';

export interface AutomationExecutionConditions {
  onlyUnbooked?: boolean;
  excludeCoreActivities?: boolean;
  noCrossDay?: boolean;
  noBudgetIncrease?: boolean;
  noDriveTimeIncrease?: boolean;
  maxItemsPerChange?: number;
  minMinutesBeforeActivity?: number;
  notifyOnApply?: boolean;
  teamCanUndo?: boolean;
}

export interface AutomationPolicy {
  defaultLevel: AutomationLevel;
  /** 可自动执行的动作语义键（legacy；catalog 优先） */
  autoAllowed: string[];
  /** 必须用户确认的动作语义键（legacy；catalog 优先） */
  confirmationRequired: string[];
  /** 按 catalog action key 覆盖默认权限 tier */
  actionOverrides?: Partial<Record<string, AutomationPermissionTier>>;
  /** 按 catalog action key 覆盖执行条件 */
  executionConditions?: Partial<Record<string, AutomationExecutionConditions>>;
}

export type TeamGovernanceRuleType =
  | 'UNANIMOUS'
  | 'MAJORITY'
  | 'PAYER_CONFIRM'
  | 'VETO'
  | 'PROTECTIVE_PRIORITY';

export interface TeamGovernanceRule {
  topic: string;
  rule: TeamGovernanceRuleType;
  memberRole?: string;
  /** 如预算增加超过 N% 需付款人确认 */
  thresholdPct?: number;
}

export interface TeamGovernancePolicy {
  rules: TeamGovernanceRule[];
}

/** trip.metadata.travelDecisionContract 持久化形态 */
export interface StoredTravelDecisionContract {
  objectives?: TravelObjectiveProfile;
  changeStrategy?: ChangeStrategyProfile;
  automation?: AutomationPolicy;
  teamGovernance?: TeamGovernancePolicy;
  /** 用户暂停自动化（S4） */
  automationPaused?: boolean;
  /** 规则作用范围：本行程 vs 用户默认模板 */
  automationScope?: AutomationAuthorizationScope;
}

export type AutomationAuthorizationScope = 'TRIP' | 'USER_TEMPLATE';

/** PATCH /constraints/contract 入参（DTO 对齐） */
export interface TravelDecisionContractPatch {
  objectives?: Pick<TravelObjectiveProfile, 'rankedPrinciples'>;
  changeStrategy?: Partial<ChangeStrategyProfile> & {
    tolerances?: Partial<ChangeStrategyTolerances>;
  };
  automation?: Partial<AutomationPolicy>;
  teamGovernance?: Partial<TeamGovernancePolicy>;
  automationPaused?: boolean;
  automationScope?: AutomationAuthorizationScope;
  /** 清空 actionOverrides / executionConditions，恢复 catalog 默认 */
  resetAutomationToDefaults?: boolean;
}

export interface CompiledObjectiveWeights {
  legacy: ObjectiveFunctionWeights;
  canonical: Partial<Record<CanonicalObjectiveId, number>>;
  /** SOFT 约束 id / templateId → priority/10，与 items[].priority 同源 */
  softPreferences?: Record<string, number>;
}

export interface TravelDecisionContractConflictSummary {
  hasConflicts: boolean;
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
  conflictConstraintIds: string[];
}

export interface TravelPrincipleDisplay {
  key: TravelPrincipleKey;
  label: string;
  rank: number;
}

/** GET /constraints 返回的合成读模型 */
export interface TravelDecisionContract {
  schemaId: 'tripnara.travel_decision_contract@v1';
  tripId: string;
  constraintsVersion: number;
  objectives: TravelObjectiveProfile;
  /** 与 rankedPrinciples 对齐的展示标签（含排序序号） */
  displayPrinciples: TravelPrincipleDisplay[];
  compiledWeights: CompiledObjectiveWeights;
  changeStrategy: ChangeStrategyProfile;
  automation: AutomationPolicy;
  teamGovernance: TeamGovernancePolicy;
  conflicts: TravelDecisionContractConflictSummary;
}

export const CHANGE_STRATEGY_LABELS: Record<ChangeStrategyArchetype, string> = {
  CONSERVATIVE: '保守型',
  BALANCED: '平衡型',
  EXPLORATORY: '探索型',
};

export const AUTOMATION_LEVEL_LABELS: Record<AutomationLevel, string> = {
  INFORM_ONLY: '仅提醒',
  SUGGEST: '建议方案',
  AUTO_REPAIR_LOW_RISK: '低风险自动修复',
  AUTO_EXECUTE_CONDITIONAL: '条件式自动执行',
};

export const TRAVEL_DECISION_CONTRACT_SECTION_KEYS = [
  'travel_objectives',
  'hard_must_satisfy',
  'soft_prefer',
  'team_members',
  'change_strategy',
  'automation',
  'conflicts_and_impact',
  'readonly_official',
  'readonly_world',
] as const;

export type TravelDecisionContractSectionKey =
  (typeof TRAVEL_DECISION_CONTRACT_SECTION_KEYS)[number];

export interface TravelDecisionContractSection {
  key: TravelDecisionContractSectionKey;
  label: string;
  constraintIds: string[];
  /** 该区块是否只读（官方规则 / 世界状态） */
  readonly?: boolean;
  /** 区块关联的合同子块（无 constraint 卡片时前端读 contract 对应字段） */
  contractBlock?: 'objectives' | 'change_strategy' | 'automation' | 'team_governance' | 'conflicts';
}

export interface TravelDecisionContractListMeta {
  tripId: string;
  constraintsVersion: number;
  total: number;
  byType: Record<TripConstraint['type'], number>;
  byStatus: Partial<Record<TripConstraint['status'], number>>;
  conflictCount: number;
  pendingConfirmCount: number;
  countryCode?: string;
  /** 约束控制台 7+2 分区 */
  sections: TravelDecisionContractSection[];
}

export interface TravelDecisionContractListResponse {
  meta: TravelDecisionContractListMeta;
  items: TripConstraint[];
  contract: TravelDecisionContract;
}
