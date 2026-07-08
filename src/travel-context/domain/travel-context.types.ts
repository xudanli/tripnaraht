import type {
  TravelContextStage,
  TravelContextViewName,
  TravelContextDomain,
} from './travel-context.constants';
import { TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID } from './travel-context.constants';

/** RFC-003 §5.1 — Travel Context Identity */
export interface TravelContextIdentity {
  contextId: string;
  stage: TravelContextStage;
  conversationId?: string;
  scenarioId?: string;
  tripId?: string;
  ownerUserId: string;
  createdAt: string;
}

export type TravelContextConsistency = 'STRONG' | 'EVENTUAL' | 'PARTIAL';

export interface TravelContextMeta {
  snapshotId: string;
  revision: number;
  generatedAt: string;
  previousRevision?: number;
  consistency: TravelContextConsistency;
  bindings: TravelContextBindings;
}

export interface TravelContextBindings {
  constraintsVersion: number;
  effectivePlanVersionId?: string;
  worldStateVersion: string;
}

export interface TravelIntentContext {
  primaryGoal?: string;
  destination: {
    status: 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN';
    countryCode?: string;
    label?: string;
    candidates?: string[];
  };
  dateRange?: {
    startDate: string;
    endDate: string;
    flexibility?: 'FIXED' | 'FLEXIBLE';
  };
  budget?: {
    currency: string;
    min?: number;
    max?: number;
    style?: string;
  };
  pacing?: string;
  mustInclude?: string[];
  mustAvoid?: string[];
  experiencePreferences?: string[];
  successCriteria?: string[];
  rankedPrinciples?: string[];
}

export interface ParticipantContext {
  count: number;
  publicSummary: Array<{
    memberId: string;
    role: string;
    displayName?: string;
    mobilityBand?: string;
  }>;
  preferenceCoverage: {
    mobility: 'COMPLETE' | 'PARTIAL' | 'MISSING';
    privateWishes: 'COMPLETE' | 'PARTIAL' | 'MISSING';
  };
  governance?: {
    decisionOwnerId?: string;
    requiresMemberConfirm: boolean;
  };
}

export type ConstraintLevel =
  | 'HARD'
  | 'STRONG_PREFERENCE'
  | 'SOFT_PREFERENCE'
  | 'INFERRED';

export interface ContextConstraint {
  id: string;
  level: ConstraintLevel;
  source:
    | 'USER_EXPLICIT'
    | 'USER_BEHAVIOR'
    | 'OFFICIAL_RULE'
    | 'SYSTEM_INFERENCE'
    | 'MEMBER_PREFERENCE';
  confidence: number;
  editable: boolean;
  overridable: boolean;
  label: string;
  domain?: string;
}

export interface TravelContractContext {
  constraints: ContextConstraint[];
  changeStrategy?: { archetype: string };
  automation?: { defaultLevel: string };
  teamGovernance?: Record<string, unknown>;
  conflictSummary?: { count: number; blockingCount: number };
}

export interface EffectivePlanContext {
  effectivePlan: {
    versionId?: string;
    dayCount: number;
    itemCount: number;
    hasEffectivePlan: boolean;
    executabilityStatus?: 'EXECUTABLE' | 'BLOCKED' | 'UNKNOWN';
  };
  pendingProposal?: {
    proposalId: string;
    source: 'USER' | 'AI' | 'MONITORING';
    summary: string;
  };
  draftChanges?: {
    hasDraft: boolean;
    changedDayCount?: number;
  };
  selectedRouteId?: string | null;
}

export type WorldFactKind =
  | 'USER_DECLARED'
  | 'SYSTEM_INFERRED'
  | 'EXTERNAL_OBSERVED'
  | 'OFFICIAL_RULE'
  | 'EFFECTIVE_DECISION';

export interface WorldFact {
  factId: string;
  type: string;
  kind: WorldFactKind;
  value: unknown;
  effectiveFrom?: string;
  expiresAt?: string;
  observedAt: string;
  sourceId: string;
  authorityLevel: string;
  confidence: number;
  replanTrigger?: boolean;
}

export interface TravelWorldContext {
  facts: WorldFact[];
  dataCompletenessScore: number;
  lastRefreshedAt?: string;
  /** Assembler 写入的 Ontology 约束摘要（BFF 只读） */
  ontologyConstraints?: {
    blockerCount: number;
    warningCount: number;
    missingEvidenceCount: number;
    codes: string[];
  };
}

export interface OpenDecision {
  decisionId: string;
  problemType: string;
  title: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status:
    | 'DETECTED'
    | 'ANALYZING'
    | 'WAITING_USER'
    | 'AUTHORIZED'
    | 'EXECUTING'
    | 'RESOLVED'
    | 'FAILED';
  affectedScope?: {
    days?: number[];
    planItemIds?: string[];
    memberIds?: string[];
  };
  recommendedOptionId?: string;
  authorizationRequired: boolean;
}

export interface DecisionContext {
  open: OpenDecision[];
  counts: {
    total: number;
    blocking: number;
    actionable: number;
  };
}

export interface MonitoringItem {
  itemId: string;
  kind: string;
  status: 'ACTIVE' | 'PENDING' | 'PAUSED';
  headline: string;
  whyMonitoring?: string;
  checkCondition?: string;
  nextCheckAt?: string;
  onChangeNotify?: string;
  onChangeAutoAct?: string;
  authorizationTier?: string;
  lastCheckedAt?: string;
}

export interface MonitoringContext {
  activeCount: number;
  items: MonitoringItem[];
  paused: boolean;
}

export interface ContextHistoryEntry {
  entryId: string;
  at: string;
  revision: number;
  kind:
    | 'INTENT_HANDLED'
    | 'DECISION_RESOLVED'
    | 'WORLD_FACT_CHANGED'
    | 'PLAN_VERSION_APPLIED'
    | 'EXPLORATION_MILESTONE';
  headline: string;
  actor?: 'USER' | 'AI' | 'SYSTEM' | 'MONITORING';
  refs?: Record<string, string>;
}

export interface ContextHistory {
  recent: ContextHistoryEntry[];
  explorationArchive?: {
    rejectedRouteIds?: string[];
    selectedRouteId?: string | null;
    researchProtocolId?: string | null;
    materializedAt?: string;
    /** Consumer ranked principles frozen at archive write */
    principles?: string[];
  };
}

/** RFC-003 §6 — full Travel Context Snapshot */
export interface TravelContextSnapshot {
  schemaId: typeof TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID;
  identity: TravelContextIdentity;
  meta: TravelContextMeta;
  intent: TravelIntentContext;
  participants: ParticipantContext;
  contract: TravelContractContext;
  plan: EffectivePlanContext;
  world: TravelWorldContext;
  decisions: DecisionContext;
  monitoring: MonitoringContext;
  history: ContextHistory;
}

/** Page projection envelope (RFC-003 §8.1.2) */
export interface TravelContextViewEnvelope<T = Record<string, unknown>> {
  contextId: string;
  snapshotId: string;
  revision: number;
  view: TravelContextViewName;
  data: T;
  observability?: {
    schemaVersion: string;
    changedDomains?: TravelContextDomain[];
  };
}
