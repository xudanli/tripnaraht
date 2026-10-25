/**
 * System1 Evidence-aware Fast Decision Runtime — 统一合同。
 * Fast Path 必须先经过 TaskFrame → Authority → Evidence，而不是正则直达 handler。
 */

export const SYSTEM1_RUNTIME_SCHEMA = 'tripnara.system1_runtime@v1' as const;

export type System1QuestionType =
  | 'FEASIBILITY'
  | 'STATE_QUERY'
  | 'KNOWLEDGE_QA'
  | 'EXPLAIN'
  | 'RECOMMEND'
  | 'WRITE_MUTATION';

export type System1RequestedAction = 'READ' | 'EXPLAIN' | 'ASSESS' | 'RECOMMEND' | 'WRITE';

export type System1Authority = 'READ' | 'EXPLAIN' | 'ASSESS' | 'RECOMMEND';

export type System1RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type System1Lifecycle = 'PLANNING' | 'TRAVELING' | 'COMPLETED';

export type System1TargetType =
  | 'POI'
  | 'ROUTE'
  | 'DAY'
  | 'LODGING'
  | 'BOOKING'
  | 'TRIP'
  | 'OTHER';

export type System1TemporalType = 'NOW' | 'TODAY' | 'TOMORROW' | 'DATE' | 'TRIP_RANGE';

export type System1EvidenceSourceType =
  | 'TRIP_STATE'
  | 'WORLD_STATE'
  | 'KNOWLEDGE'
  | 'ONTOLOGY'
  | 'MEMORY'
  | 'TOOL'
  | 'EXTERNAL_API'
  | 'USER_INPUT';

export type System1EvidenceStatus = 'VERIFIED' | 'STALE' | 'ASSUMED' | 'UNAVAILABLE';

export type System1SufficiencyStatus =
  | 'SUFFICIENT'
  | 'PARTIAL'
  | 'INSUFFICIENT'
  | 'CONFLICTED';

export type System1AnswerMode = 'STRONG' | 'CONDITIONAL' | 'PARTIAL' | 'NO_ANSWER';

export type System1RecommendedRoute =
  | 'SYSTEM1_ANSWER'
  | 'ASK_USER'
  | 'FETCH_MORE'
  | 'SYSTEM2_ASSISTED'
  | 'SYSTEM3_DELIBERATE';

export type System1ClaimType =
  | 'STATE_FACT'
  | 'WORLD_FACT'
  | 'TIME_ESTIMATE'
  | 'ACCESSIBILITY'
  | 'RISK_ASSESSMENT'
  | 'FEASIBILITY'
  | 'RECOMMENDATION'
  | 'CONSTRAINT'
  | 'BOOKING_FACT';

export type System1ClaimStrength = 'STRONG' | 'CONDITIONAL' | 'WEAK';

export type System1IssueCode =
  | 'ROUTING_ERROR'
  | 'TASK_FRAME_ERROR'
  | 'CONTEXT_REQUIREMENT_ERROR'
  | 'RETRIEVAL_FAILURE'
  | 'WORLD_STATE_FAILURE'
  | 'EVIDENCE_FAILURE'
  | 'GENERATION_ERROR'
  | 'AUTHORITY_ERROR';

export type System1RuntimeFamily =
  | 'LIVE_FEASIBILITY'
  | 'TRIP_QUERY_LODGING'
  | 'TRIP_QUERY_TODAY'
  | 'TRIP_QUERY_NEXT'
  | 'TRIP_QUERY_DAY'
  | 'KNOWLEDGE_QA'
  | 'DECISION_SUPPORT'
  | 'WEATHER_ROAD_QA'
  | 'INVENTORY_CONSULT';

export type System1TaskFrame = {
  intent: string;
  questionType: System1QuestionType;
  target?: {
    type: System1TargetType;
    id?: string;
    name?: string;
  };
  temporalScope?: {
    type: System1TemporalType;
    value?: string;
  };
  requestedAction: System1RequestedAction;
  riskLevel: System1RiskLevel;
  lifecycle: System1Lifecycle;
  sourceSignals: {
    taskType?: string;
    actionKind?: string;
    /** 兼容：语义意图字符串（= UnifiedIntent.semanticIntent） */
    unifiedIntent?: string;
    creOperation?: string;
    /** 上游结构化投影（避免平行模型各说各话） */
    intentTopic?: string;
    intentRouteClass?: string;
    mutationPolicy?: string;
    contractAuthority?: string;
    allowFullPlanning?: boolean;
  };
};

export type RequiredEvidenceSpec = {
  key: string;
  required: boolean;
  importance: 'CRITICAL' | 'IMPORTANT' | 'OPTIONAL';
  acceptableSources: System1EvidenceSourceType[];
  freshnessRequirement?: {
    maxAgeSeconds?: number;
    requireLive?: boolean;
  };
  onMissing: 'ANSWER_CONDITIONALLY' | 'ASK_USER' | 'FETCH' | 'ESCALATE';
};

export type System1Evidence = {
  evidenceId: string;
  key: string;
  sourceType: System1EvidenceSourceType;
  sourceRef?: string;
  value: unknown;
  status: System1EvidenceStatus;
  confidence?: number;
  observedAt?: string;
  expiresAt?: string;
  provenance?: {
    provider?: string;
    documentId?: string;
    api?: string;
    ruleId?: string;
  };
};

export type EvidenceSufficiencyResult = {
  status: System1SufficiencyStatus;
  missingEvidence: string[];
  staleEvidence: string[];
  conflictingEvidence: Array<{
    key: string;
    evidenceIds: string[];
  }>;
  canAnswer: boolean;
  answerMode: System1AnswerMode;
  recommendedRoute: System1RecommendedRoute;
  reason: string;
};

export type System1Claim = {
  claimId: string;
  type: System1ClaimType;
  text: string;
  evidenceKeys: string[];
  strength: System1ClaimStrength;
};

export type System1ClaimGrounding = {
  claimId: string;
  status: 'GROUNDED' | 'UNGROUNDED';
  strengthAllowed: System1ClaimStrength;
  reason: string;
};

export type System1AuthorityDecision = {
  allowed: boolean;
  authority: System1Authority | 'NONE';
  reason: string;
  escalateTo: 'SYSTEM2_ASSISTED' | 'ASK_USER' | null;
  changeProposal?: {
    kind: 'ADD_ITEM' | 'DELETE_ITEM' | 'MOVE_ITEM' | 'CHANGE_BOOKING' | 'APPLY_ROUTE';
    targetName?: string;
    applied: false;
  };
};

export type System1Issue = {
  code: System1IssueCode;
  messageZh: string;
  details?: Record<string, unknown>;
};

export type EvidenceAcquisitionAction =
  | 'SKIP'
  | 'FETCH'
  | 'ASK_USER'
  | 'ANSWER_CONDITIONALLY'
  | 'ESCALATE';

export type EvidenceAcquisitionItem = {
  key: string;
  action: EvidenceAcquisitionAction;
  reason: string;
};

export type EvidenceAcquisitionPlan = {
  items: EvidenceAcquisitionItem[];
  fetchKeys: string[];
  askKeys: string[];
  escalateKeys: string[];
  /** 本轮实际已发起 FETCH 的 key */
  fetchedKeys?: string[];
  fetchLog?: Array<{ key: string; ok: boolean; count: number; detail?: string }>;
};

/** CRE 作为取数编排器时的投影（不替代 Family RequiredEvidence） */
export type System1CreOrchestration = {
  operation: string;
  nextAction: string;
  creFetchKeys: string[];
  mappedFetchKeys: string[];
  constrainedKeys: string[];
};

export type System1TurnTrace = {
  schemaId: typeof SYSTEM1_RUNTIME_SCHEMA;
  family?: System1RuntimeFamily;
  taskFrame: System1TaskFrame;
  /** Claim-driven 取证的候选类型（Decision Artifact） */
  candidateClaimTypes?: System1ClaimType[];
  authority: System1AuthorityDecision;
  requiredEvidence: RequiredEvidenceSpec[];
  acquisition?: EvidenceAcquisitionPlan;
  cre?: System1CreOrchestration;
  retrievedEvidence: System1Evidence[];
  sufficiency: EvidenceSufficiencyResult | null;
  claims: System1Claim[];
  groundingResult: System1ClaimGrounding[];
  routeDecision: {
    recommendedRoute: System1RecommendedRoute;
    answerMode: System1AnswerMode;
  };
  issues: System1Issue[];
  finalAnswer: string;
};
