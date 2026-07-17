/**
 * Nara Contextual Copilot — Page Insight contracts (ADR-010).
 * Schema: tripnara.nara_page_insight@v1
 *
 * Copilot explains/suggests/presents only. Writes go through existing
 * Preview → Validate → Confirm → Ledger paths via refs, never free-form LLM params.
 */

/** Pages that may register a PageAIContract. Extend only with a contract entry. */
export type PageId =
  | 'PLANNING_OVERVIEW'
  | 'ACTIVITY_EDITOR'
  | 'ITINERARY_DAY_EDITOR'
  /** @deprecated Use ITINERARY_DAY_EDITOR — kept as registry alias. */
  | 'ITINERARY_EDITOR'
  | 'MAP_ROUTE'
  | 'DECISION_SPACE'
  | 'TEAM_REQUIREMENTS'
  | 'READINESS_REPORT'
  | 'EXECUTION_HOME';

/**
 * Copilot page mode — must align with pageId for the four progressive slices
 * to prevent context bleed across surfaces.
 */
export type CopilotPageMode =
  | 'ACTIVITY_EDITOR'
  | 'ITINERARY_DAY_EDITOR'
  | 'PLANNING_OVERVIEW'
  | 'EXECUTION_HOME';

/** Insight context scope — object → day → trip → execution. */
export type InsightScope =
  | 'ACTIVITY'
  | 'ITINERARY_DAY'
  | 'TRIP'
  | 'EXECUTION';

export type TripLifecycle = 'PLANNING' | 'TRAVELING' | 'COMPLETED';

export type InsightMode = 'SILENT' | 'ATTENTION' | 'INTERVENTION';

export type InsightPriority = 'P0' | 'P1' | 'P2';

export type InsightType =
  | 'EXPLANATION'
  | 'OPTIMIZATION'
  | 'DECISION_REQUIRED'
  | 'EXECUTION_RISK'
  | 'READINESS_GAP'
  | 'TEAM_CONFLICT'
  | 'DATA_UNCERTAINTY';

export type InsightDimension =
  | 'TIME'
  | 'SAFETY'
  | 'FATIGUE'
  | 'COST'
  | 'EXPERIENCE'
  | 'TEAM'
  | 'BOOKING'
  | 'ROUTE';

export type ImpactSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type InsightFeedbackType =
  | 'OPENED'
  | 'DISMISSED'
  | 'SNOOZED'
  | 'ACTION_PREVIEWED'
  | 'ACTION_ACCEPTED'
  | 'ACTION_REJECTED'
  | 'NOT_RELEVANT';

export type InsightRecordStatus =
  | 'ACTIVE'
  | 'STALE'
  | 'SUPERSEDED';

export type PresentationSurface =
  | 'INLINE'
  | 'RIGHT_RAIL'
  | 'BOTTOM_SHEET'
  | 'BANNER';

export interface EntityRef {
  entityType: string;
  entityId: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Client-submitted page state. References + ephemeral UI only.
 * Never treat as complete Page Context or as evidence.
 */
export interface ClientPageState {
  pageId: PageId;
  lifecycle: TripLifecycle;
  /**
   * Required for ACTIVITY_EDITOR / day / overview / execution slices.
   * Optional for DECISION_SPACE (legacy clients).
   */
  pageMode?: CopilotPageMode;
  /** Required when pageMode is set — must match the page's insightScope. */
  insightScope?: InsightScope;
  selectedRefs?: EntityRef[];
  viewport?: {
    activeTab?: string;
    selectedDayId?: string | null;
    /** 1-based day index when DAY id is unknown (Activity Editor). */
    selectedDayIndex?: number | null;
    mapBounds?: MapBounds;
  };
  draftRef?: {
    draftId: string;
    revision: number;
  } | null;
  /** Optional top-level draft revision (mirrors draftRef.revision). */
  draftRevision?: number;
  recentAction?: {
    type: string;
    targetRef?: EntityRef;
  };
  forceRefresh?: boolean;
  locale?: string;
}

/** Opaque projections — concrete shapes live in domain modules; Copilot only holds bags. */
export interface TripSnapshotRef {
  tripVersion: string;
  /** Domain snapshot payload or handle; assembler fills. */
  payload?: unknown;
}

export interface WorldStateProjection {
  worldStateVersion: string;
  payload?: unknown;
}

export interface ConstraintAssessmentRef {
  assessmentId: string;
  payload?: unknown;
}

export interface DecisionProblemRef {
  problemId: string;
  payload?: unknown;
}

export interface ReadinessProjection {
  readinessVersion?: string;
  payload?: unknown;
}

export interface EntityProjection {
  ref: EntityRef;
  payload?: unknown;
}

export interface ContextDelta {
  draftId: string;
  revision: number;
  /** Server-loaded draft diff vs canonical; never client-authored plan body. */
  payload?: unknown;
}

export interface AvailableAction {
  actionType: string;
  ref: string;
  kind: 'NAVIGATION' | 'PREVIEW' | 'COMMAND';
}

/**
 * Server-assembled authoritative context for one evaluate.
 * Reasoning input = Canonical Snapshot ⊕ Draft Context Delta ⊕ Current Page Focus.
 */
export interface AuthoritativePageContext {
  tripSnapshot: TripSnapshotRef;
  relevantWorldState: WorldStateProjection;
  constraintAssessments: ConstraintAssessmentRef[];
  decisionProblems: DecisionProblemRef[];
  readinessProjection?: ReadinessProjection;
  selectedEntities: EntityProjection[];
  draftDelta?: ContextDelta;
  availableActions: AvailableAction[];
  pageFocus: {
    pageId: PageId;
    lifecycle: TripLifecycle;
    selectedRefs: EntityRef[];
    viewport?: ClientPageState['viewport'];
    recentAction?: ClientPageState['recentAction'];
  };
}

export interface InsightObservation {
  summary: string;
  factRefs: string[];
}

export interface InsightExplanation {
  summary: string;
  causalChainRefs?: string[];
}

export interface InsightImpact {
  dimension: InsightDimension;
  severity: ImpactSeverity;
  summary: string;
}

export interface InsightRecommendation {
  summary: string;
  rationale: string;
  recommendedOptionId?: string;
}

export type PreviewActionType =
  | 'PREVIEW_PLAN_CHANGE'
  | 'COMPARE_OPTIONS'
  | 'RUN_WHAT_IF'
  | 'OPEN_DECISION'
  | 'PREVIEW_ADD_ACTIVITY'
  | 'COMPARE_TARGET_DAYS'
  | 'REPLACE_ACTIVITY'
  | 'ADJUST_DURATION'
  | 'PREVIEW_REORDER'
  | 'MOVE_TO_ANOTHER_DAY'
  | 'ADD_BUFFER'
  | 'OPEN_CONFLICT'
  | 'OPEN_DECISION_CASE'
  | 'OPEN_DAY_EDITOR'
  | 'OPEN_READINESS_DETAIL'
  | 'START_SEQUENTIAL_PROCESSING'
  | 'FILL_GAP'
  | 'GENERATE_DAY_DRAFT'
  | 'CONFIRM_BOOKING'
  | 'OPEN_LODGING';

export type CommandActionType =
  | 'APPLY_PLAN_PROPOSAL'
  | 'CONFIRM_DECISION'
  | 'ACKNOWLEDGE_RISK'
  | 'GENERATE_DAY_DRAFT'
  | 'FILL_GAP'
  | 'CONFIRM_BOOKING';

export type InsightAction =
  | {
      kind: 'NAVIGATION';
      label: string;
      target: {
        pageId: PageId;
        entityRef?: EntityRef;
      };
    }
  | {
      kind: 'PREVIEW';
      label: string;
      actionType: PreviewActionType;
      payloadRef: string;
    }
  | {
      kind: 'COMMAND';
      label: string;
      actionType: CommandActionType;
      commandRef: string;
      requiresConfirmation: true;
      validationRequired: true;
    };

export interface InsightContextMeta {
  contextHash: string;
  tripVersion: string;
  worldStateVersion?: string;
  decisionWorkspaceVersion?: string;
  draftRevision?: number | null;
  pageContractVersion: string;
}

export interface NaraPageInsight {
  id: string;
  tripId: string;
  pageId: PageId;
  mode: InsightMode;
  priority: InsightPriority;
  insightType: InsightType;
  title: string;
  observation: InsightObservation;
  explanation: InsightExplanation;
  impacts: InsightImpact[];
  recommendation?: InsightRecommendation;
  actions: InsightAction[];
  confidence: number;
  evidenceRefs: string[];
  context: InsightContextMeta;
  generatedAt: string;
  expiresAt?: string;
  /**
   * Advisor-facing short copy（标题 / 说明 / 建议）.
   * When present, FE should render only these three lines — not observation+impacts+causal card.
   */
  advisorCopy?: {
    title: string;
    body: string;
    advice: string;
  };
  /**
   * When focused problem has TravelCausalDecision — optional rich card.
   * Prefer `advisorCopy` for the yellow Insight strip; use this only as fallback
   * when advisorCopy is absent (e.g. older clients). See FRONTEND_INSIGHT_CARD.md.
   */
  causalDecisionCard?: import('../../../travel-causal-decision').CausalDecisionCardView;
}

export interface PageInsightModeTriggersDiag {
  blockingDecision: boolean;
  safetyRelated: boolean;
  materialOptionDivergence: boolean;
  staleEvidence: boolean;
  unresolvedDecision: boolean;
}

export interface PageInsightEvaluationMeta {
  contextHash: string;
  cacheHit: boolean;
  authoritativeAssembledAt: string;
  llmUsed: boolean;
  degradedReason?: string;
  /** Why insight.mode was chosen (debug / FE logging). */
  modeReason?: string;
  /** User asked via forceRefresh. */
  explicitAsk?: boolean;
  focusedProblemId?: string | null;
  openProblemCount?: number;
  /** Focused id is in the open-queue set used by Orchestrator. */
  focusedInOpenQueue?: boolean;
  /** From focused.actionability.requiresAction when focused exists. */
  focusedRequiresAction?: boolean | null;
  focusedWorkflowStatus?: string | null;
  focusedEnforcement?: string | null;
  allowedOptionCount?: number;
  /** From Assembler focus resolution (problemId vs instanceKey). */
  clientSelectedRef?: string | null;
  focusResolveStatus?: string | null;
  focusMatchedVia?: 'problemId' | 'instanceKey' | 'fallback' | 'none' | null;
  workspacePresentForFocused?: boolean | null;
  openProblemIdsSample?: string[];
  openInstanceKeysSample?: string[];
  triggers?: PageInsightModeTriggersDiag | null;
  /** Rental insurance: Context Builder completeness (deterministic). */
  insuranceContextGate?: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: string[];
    confirmedFactCount: number;
    missingFields: string[];
  } | null;
  /** Vehicle road-fit: Context Builder completeness (deterministic). */
  vehicleContextGate?: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: string[];
    containsFRoad?: boolean;
    recommendedVehicleType?: string;
    confirmedFactCount: number;
  } | null;
  /** Decision Case AI Contract key applied for this evaluate. */
  caseAiSemanticKey?: string | null;
  caseAiMode?: string | null;
  /** Schedule conflict: how many Gateway option previews Context Builder collected. */
  validatedPreviewCount?: number | null;
  /** Among collected previews, how many passed resolved && no remaining blockers. */
  validatedResolvedCount?: number | null;
  /** Activity Editor: arrange-itinerary proposal validation status. */
  activityProposalStatus?: 'PASS' | 'WARN' | 'BLOCK' | null;
  activityProposalId?: string | null;
  activityContextGate?: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: string[];
  } | null;
  /** Day editor: feasibility severity + proposal. */
  daySeverity?: 'CLEAR' | 'SOFT' | 'HARD' | null;
  dayPlanStatus?: 'INCOMPLETE' | 'BLOCKED' | 'TIGHT' | 'OPTIMIZABLE' | 'READY' | null;
  dayProposalStatus?: 'PASS' | 'WARN' | 'BLOCK' | null;
  dayProposalId?: string | null;
  dayContextGate?: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: string[];
  } | null;
  dayMustHandleCount?: number | null;
  daySuggestAdjustCount?: number | null;
  /** Planning overview trip-level diag. */
  overviewSeverity?: 'CLEAR' | 'ATTENTION' | 'BLOCKING' | null;
  overviewMustConfirmCount?: number | null;
  overviewImportantChoiceCount?: number | null;
  overviewOpenProblemCount?: number | null;
  overviewTopProblemId?: string | null;
  overviewContextGate?: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: string[];
  } | null;
  /** Execution home diag. */
  execSeverity?: 'CLEAR' | 'ATTENTION' | 'INTERVENTION' | null;
  execDelayMinutes?: number | null;
  execAdvisoryVerdict?: string | null;
  execTopRiskId?: string | null;
  execTopRiskLevel?: string | null;
  execInterventionDeadline?: string | null;
  execContextGate?: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: string[];
  } | null;
}

export interface PageInsightEvaluateResponse {
  schema: 'tripnara.nara_page_insight@v1';
  evaluation: PageInsightEvaluationMeta;
  insight: NaraPageInsight;
}

export interface PageInsightGetResponse {
  schema: 'tripnara.nara_page_insight@v1';
  insight: NaraPageInsight;
  status: InsightRecordStatus;
}

export interface PageInsightFeedbackRequest {
  type: InsightFeedbackType;
  actionRef?: string | null;
  note?: string | null;
  clientTimestamp?: string;
}

/**
 * Per-page capability contract. Versioned config / code — not a Prompt file.
 */
export interface PageAIContract {
  pageId: PageId;
  /** Semver-ish or monotonic id; included in contextHash. */
  pageContractVersion: string;
  userGoal: string;
  relevantContext: {
    /** Projection ids the Context Builder must attempt to load for this page. */
    projections: string[];
    entityTypes: string[];
    includeDraftDelta: boolean;
    /** Include Decision Problem evidenceRefs / causal refs in insight assembly. */
    includeDecisionEvidence?: boolean;
  };
  /**
   * Decision-domain overlays (e.g. rental insurance). Context Builder enforces
   * required projections and completeness gates before Narrative / LLM.
   */
  decisionContextRequirements?: Partial<
    Record<
      string,
      {
        projections: string[];
        /** Hard-required for recommendations; missing → CONTEXT_MISSING. */
        hardRequired?: string[];
        /**
         * RAG may only supply insurance-clause knowledge — never replace trip facts.
         */
        ragPolicy?: 'EXPLANATORY_CLAUSES_ONLY';
      }
    >
  >;
  /**
   * Fields that participate in contextHash for this page.
   * Unlisted ClientPageState fields must not invalidate cache.
   */
  contextHashFields: Array<
    | 'pageId'
    | 'pageMode'
    | 'insightScope'
    | 'lifecycle'
    | 'selectedEntityRefs'
    | 'relevantTripProjectionVersion'
    | 'relevantConstraintVersion'
    | 'relevantDecisionWorkspaceVersion'
    | 'relevantWorldStateVersion'
    | 'draftRevision'
    | 'selectedDayId'
    | 'mapBounds'
    | 'activeTab'
  >;
  focusDimensions: InsightDimension[];
  supportedInsightTypes: InsightType[];
  allowedActionTypes: string[];
  proactivePolicy: {
    attentionTriggers: string[];
    interventionTriggers: string[];
    maxVisibleInsights: number;
    cooldownMinutes: number;
  };
  presentation: {
    defaultSurface: PresentationSurface;
  };
}
