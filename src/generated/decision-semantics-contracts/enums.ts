/**
 * Decision Semantics V1.6.1 — UI label maps for Decision Center.
 * Generated contract surface; do not rename keys without a contract bump.
 */

import type {
  ConstraintEnforcement,
  ConstraintNature,
  DecisionExecutionMode,
  DecisionProblemStatus,
  DecisionProblemType,
  ObservedOutcomeSource,
  OutcomeValidationVerdict,
  TradeoffDimensionKey,
  ExecutionCapability,
} from '../../trips/decision-semantics/types/decision-semantics.types';

/** Alias used in frontend docs (same as ConstraintEnforcement). */
export type DecisionEnforcement = ConstraintEnforcement;

export const DECISION_SEMANTICS_CONTRACT_VERSION = '1.6.1';

export const CONSTRAINT_ENFORCEMENT_LABELS: Record<ConstraintEnforcement, string> = {
  BLOCK: '必须处理',
  REQUIRE_ADJUSTMENT: '建议立即调整',
  REQUIRE_CONFIRMATION: '等待用户决定',
  WARN: '风险提醒',
  INFORM: '信息更新',
};

export const CONSTRAINT_NATURE_LABELS: Record<ConstraintNature, string> = {
  HARD_CONSTRAINT: '硬约束',
  SOFT_CONSTRAINT: '软约束',
  RISK_PREDICTION: '风险预测',
  INFORMATION_GAP: '信息缺口',
};

export const DECISION_PROBLEM_TYPE_LABELS: Record<DecisionProblemType, string> = {
  INFEASIBILITY: '不可行',
  RISK: '风险',
  PREFERENCE_CONFLICT: '偏好冲突',
  RESOURCE_CONFLICT: '资源冲突',
  EXECUTION_DEVIATION: '执行偏差',
  DATA_UNCERTAINTY: '数据不确定',
};

export const DECISION_PROBLEM_STATUS_LABELS: Record<DecisionProblemStatus, string> = {
  OPEN: '待处理',
  ASSESSING: '评估中',
  WAITING_DECISION: '等待决策',
  DECIDED: '已决策',
  RESOLVED: '已解决',
  DISMISSED: '已忽略',
};

export const TRADEOFF_DIMENSION_LABELS: Record<TradeoffDimensionKey, string> = {
  TIME: '时间',
  COST: '成本',
  POI_COVERAGE: '景点覆盖',
  COMFORT: '舒适度',
  SAFETY: '安全',
  FATIGUE: '疲劳',
  SCENERY: '风景',
  FLEXIBILITY: '灵活性',
  GROUP_FAIRNESS: '团队公平',
  BOOKING_LOSS: '预订损失',
  CARBON: '碳排',
  CERTAINTY: '确定性',
};

export const OUTCOME_VALIDATION_VERDICT_LABELS: Record<OutcomeValidationVerdict, string> = {
  PENDING: '待验证',
  CONFIRMED: '已确认',
  PARTIALLY_CONFIRMED: '部分确认',
  REFUTED: '已否定',
  INCONCLUSIVE: '证据不足',
};

export const DECISION_EXECUTION_MODE_LABELS: Record<DecisionExecutionMode, string> = {
  AUTO: '自动执行',
  AUTO_WITH_NOTIFICATION: '自动执行（通知）',
  EXPLICIT_CONFIRMATION: '需明确确认',
  MULTI_PARTY_APPROVAL: '多方审批',
};

export const EXECUTION_CAPABILITY_LABELS: Record<ExecutionCapability, string> = {
  DIRECT: '可一键执行',
  PARTIAL: '部分自动',
  GUIDED_MANUAL: '需按指引操作',
  ADVISORY_ONLY: '仅建议',
};

export const OBSERVED_OUTCOME_SOURCE_LABELS: Partial<Record<ObservedOutcomeSource, string>> = {
  GPS: 'GPS',
  USER_CONFIRMATION: '用户确认',
  USER_ARRIVAL_CLICK: '到达打卡',
  ITINERARY_ITEM_STATUS: '行程项状态',
  BOOKING_CHECKIN: '预订入住',
  NAVIGATION_EVENT: '导航事件',
  BOOKING_STATUS: '预订状态',
  WEATHER_FEED: '天气数据',
  ROAD_FEED: '路况数据',
  POI_FEEDBACK: 'POI 反馈',
  SYSTEM_INFERENCE: '系统推断',
};
