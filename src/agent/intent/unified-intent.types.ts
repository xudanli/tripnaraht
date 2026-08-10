/**
 * Unified Intent Decision — 语义意图与执行路径拆分（P0）。
 *
 * 原则：先冻结本轮意图，再允许 CRE / ROR / Gate 按路线运行。
 * P0 仅 Shadow：产出决策与对比日志，不改变现网路由。
 */

export const SEMANTIC_INTENTS = [
  'CONSULT',
  'ASSESS_IMPACT',
  'LOCAL_EDIT',
  'GLOBAL_PLAN',
] as const;
export type SemanticIntent = (typeof SEMANTIC_INTENTS)[number];

export const REQUESTED_OPERATIONS = [
  'ANSWER',
  'SIMULATE',
  'CREATE_DRAFT',
  'APPLY_DRAFT',
] as const;
export type RequestedOperation = (typeof REQUESTED_OPERATIONS)[number];

export const INTENT_SCOPES = [
  'POINT',
  'ACTIVITY',
  'DAY',
  'MULTI_DAY',
  'TRIP',
] as const;
export type IntentScope = (typeof INTENT_SCOPES)[number];

export const INTENT_TOPICS = [
  'WEATHER',
  'ROAD',
  'VEHICLE',
  'MEAL',
  'LODGING',
  'ACTIVITY',
  'ROUTE',
  'PACE',
  'GENERAL',
] as const;
export type IntentTopic = (typeof INTENT_TOPICS)[number];

export const MUTATION_POLICIES = [
  'READ_ONLY',
  'DRAFT_ONLY',
  'CONFIRMED_APPLY',
] as const;
export type MutationPolicy = (typeof MUTATION_POLICIES)[number];

export const EXECUTION_ROUTE_CLASSES = [
  'LIGHT_QA',
  'STATEFUL_QA',
  'IMPACT_SIMULATION',
  'LOCAL_EDIT_DRAFT',
  'FULL_PLAN_DRAFT',
  'APPLY_CONFIRMED_DRAFT',
] as const;
export type ExecutionRouteClass = (typeof EXECUTION_ROUTE_CLASSES)[number];

export type IntentEvidenceSource =
  | 'UTTERANCE'
  | 'ENTRY_POINT'
  | 'HISTORY'
  | 'MODE_LOCK'
  | 'FRONTEND_HINT'
  | 'TRIP_BINDING';

export type UnifiedIntentEvidence = {
  source: IntentEvidenceSource;
  signal: string;
  weight: number;
};

export type UnifiedIntentConflict = {
  source: string;
  proposedIntent: SemanticIntent;
};

export type UnifiedIntentTarget = {
  tripId?: string;
  dayIndex?: number;
  activityId?: string;
  poiId?: string;
  referencedDraftId?: string;
};

export type UnifiedIntentSecondary = {
  intent: SemanticIntent;
  topic?: IntentTopic;
};

/**
 * 本轮唯一意图冻结对象（下游合同只消费此对象，P0 Shadow 阶段仅观测）。
 */
export type UnifiedIntentDecision = {
  schema: 'tripnara.unified_intent_decision@v1';
  semanticIntent: SemanticIntent;
  requestedOperation: RequestedOperation;
  topic: IntentTopic;
  scope: IntentScope;
  target: UnifiedIntentTarget;
  mutationPolicy: MutationPolicy;
  requiresTripState: boolean;
  requiresRealityData: boolean;
  requiresDecisionSimulation: boolean;
  confidence: number;
  evidence: UnifiedIntentEvidence[];
  conflicts: UnifiedIntentConflict[];
  routeClass: ExecutionRouteClass;
  /** 复合句次要意图（不抢主路由） */
  secondaryIntents?: UnifiedIntentSecondary[];
};

/** 确定性信号抽取（规则层；主题 ≠ 意图） */
export type UnifiedIntentSignals = {
  utterance: string;
  hasConsultAct: boolean;
  hasAssessAct: boolean;
  hasLocalEditAct: boolean;
  hasGlobalPlanAct: boolean;
  explicitNoMutation: boolean;
  explicitApplyDraft: boolean;
  topic: IntentTopic;
  scope: IntentScope;
  dayIndex?: number;
  tripId?: string | null;
  entryPoint?: string | null;
  frontendSuggestedIntent?: SemanticIntent | null;
};

/** Shadow 对比：新旧路由是否一致 */
export type UnifiedIntentShadowCompare = {
  schema: 'tripnara.unified_intent_shadow@v1';
  legacyTaskType?: string;
  legacyActionKind?: string;
  legacyCreOperation?: string;
  legacyRouteMode?: string;
  legacyDecisionDepth?: string;
  /** 粗映射的「旧世界会走的路线标签」 */
  legacyRouteLabel: string;
  decision: UnifiedIntentDecision;
  routeMismatch: boolean;
  mismatchReasons: string[];
};
