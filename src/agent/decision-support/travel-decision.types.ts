/**
 * Travel Decision Support — 领域对象（业务真相；decision_options 只是投影）。
 * Decision Runtime 记录「选了什么」；Itinerary Runtime 再决定「如何改行程」。
 */

export const TRAVEL_DECISION_PROBLEM_SCHEMA_ID =
  'tripnara.travel_decision_problem@v1' as const;

export type DecisionCategory =
  | 'VEHICLE'
  | 'INSURANCE'
  | 'ROUTE_STRATEGY'
  | 'ACCOMMODATION_STRATEGY'
  | 'EXPERIENCE'
  | 'PACE'
  | 'LIVE_EXECUTION'
  | 'TEAM_CHOICE';

export type DecisionProblemState =
  | 'OPEN'
  | 'NEEDS_CONTEXT'
  | 'OPTIONS_READY'
  | 'RECOMMENDED'
  | 'SELECTED'
  | 'COMMITTED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type DecisionDimension =
  | 'SAFETY'
  | 'TIME'
  | 'COST'
  | 'FATIGUE'
  | 'EXPERIENCE'
  | 'FLEXIBILITY';

export type DimensionLevel =
  | 'VERY_LOW'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'VERY_HIGH';

export type OptionFeasibility =
  | 'FEASIBLE'
  | 'FEASIBLE_WITH_CHANGES'
  | 'NEEDS_CONFIRMATION'
  | 'BLOCKED';

export type PersistenceTarget =
  | 'DECISION_CONTRACT'
  | 'TRIP_PREFERENCE'
  | 'MEMBER_CONSTRAINT'
  | 'ITINERARY_DRAFT'
  | 'EXECUTION_ACTION';

export type OptionDimensionResult = {
  dimension: DecisionDimension;
  level: DimensionLevel;
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  explanation: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type TravelDecisionOption = {
  optionId: string;
  label_zh: string;
  summary_zh: string;
  feasibility: OptionFeasibility;
  blockingReasons_zh?: string[];
  requiredChanges_zh?: string[];
  dimensions: OptionDimensionResult[];
  consequences_zh?: string[];
  recommended?: boolean;
};

export type TravelDecisionProblem = {
  schema_id: typeof TRAVEL_DECISION_PROBLEM_SCHEMA_ID;
  decisionId: string;
  tripId: string;
  decisionKey: string;
  category: DecisionCategory;
  state: DecisionProblemState;
  subject: {
    title_zh: string;
    question_zh: string;
    reason_zh: string;
  };
  scope: {
    tripLevel: boolean;
    affectedDayIds?: string[];
  };
  options: TravelDecisionOption[];
  recommendation?: {
    optionId: string;
    reason_zh: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    decisiveDimensions?: DecisionDimension[];
  };
  selection?: {
    optionId: string;
    selectedBy?: string;
    selectedAt: string;
  };
  persistenceTarget: PersistenceTarget;
  /** 选择写入后是否提示生成行程草案（不静默 Apply） */
  downstreamDraftHint_zh?: string;
};

export type DecisionDefinition = {
  decisionKey: string;
  category: DecisionCategory;
  title_zh: string;
  question_zh: string;
  reason_zh: string;
  /** 显式话术命中（正则源字符串） */
  explicitPatterns: RegExp[];
  dimensionProfile: DecisionDimension[];
  persistenceTarget: PersistenceTarget;
  optionSkeleton: Array<{
    optionId: string;
    label_zh: string;
    strategy_zh: string;
  }>;
};
