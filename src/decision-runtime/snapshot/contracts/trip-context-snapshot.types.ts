/**
 * Trip Context Snapshot — single SSOT read model for planning / validate / repair / replan.
 * @see internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md §5.2
 */

import type { CanonicalWorldStateSnapshot } from '../../contracts/world-state-snapshot';
import type {
  AutomationPolicy,
  ChangeStrategyProfile,
  TeamGovernancePolicy,
  TravelDecisionContractConflictSummary,
  TravelObjectiveProfile,
  TravelPrincipleKey,
} from '../../../trips/trip-constraint-solver/types/travel-decision-contract.types';

export const TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID = 'tripnara.trip_context_snapshot@v1';

/** v1.1 extension — optional travel compiler artifacts on assemble() */
export interface TripContextTravelGraphView {
  compileId?: string;
  status?: string;
  score?: number;
  finishedAt?: string;
  poiResolved?: number;
  poiUnresolved?: number;
}

export interface TripContextSnapshotBindings {
  constraintsVersion: number;
  effectivePlanVersionId?: string;
  worldSnapshotId: string;
  dataCompletenessScore: number;
}

export interface TripContextGoalView {
  rankedPrinciples: TravelPrincipleKey[];
  rawUserIntent?: string;
  destination: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  tripStatus?: string | null;
}

export interface TripContextMembersView {
  count: number;
  travelers: unknown[];
}

export interface TripContextPreferencesView {
  /** 本次旅行：pacing / 合同原则 / 行程级偏好 */
  tripScoped: Record<string, unknown>;
  /** 长期用户画像不在 Snapshot v1 内联；仅提示是否可装配 */
  userScopedAvailable: boolean;
}

export interface TripContextContractView {
  objectives: TravelObjectiveProfile;
  changeStrategy: ChangeStrategyProfile;
  automation: AutomationPolicy;
  teamGovernance: TeamGovernancePolicy;
  conflicts: TravelDecisionContractConflictSummary;
}

export interface TripContextEffectivePlanView {
  versionId?: string;
  dayCount: number;
  itemCount: number;
  hasEffectivePlan: boolean;
  /** Travel Compiler 从 Graph 投影的 Itinerary 项数（metadata.graphProjectedItinerary） */
  graphProjectedItemCount?: number;
}

export interface TripContextBudgetView {
  currency?: string;
  total?: number;
  style?: string;
}

export interface TripContextOpenDecisionsView {
  count: number;
  blockingCount: number;
  actionableCount: number;
  problemIds: string[];
}

export interface TripContextUncertaintyView {
  problemId: string;
  headline: string;
  affectedDayNumbers?: number[];
}

export interface TripContextDecisionHistoryItem {
  resolutionId: string;
  problemId: string;
  selectedActionId: string;
  status: string;
  decidedAt: string;
}

export interface TripContextMonitoringView {
  activeCount: number;
  items: Array<{
    kind: string;
    status: 'ACTIVE' | 'PENDING' | 'PAUSED';
    lastCheckedAt?: string;
  }>;
}

export interface TripContextSnapshotView {
  schemaId: typeof TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID;
  snapshotId: string;
  revision: string;
  tripId: string;
  createdAt: string;
  tripUpdatedAt: string;
  bindings: TripContextSnapshotBindings;
  goal: TripContextGoalView;
  members: TripContextMembersView;
  preferences: TripContextPreferencesView;
  contract: TripContextContractView;
  effectivePlan: TripContextEffectivePlanView;
  budget?: TripContextBudgetView;
  worldFacts: CanonicalWorldStateSnapshot;
  openDecisions: TripContextOpenDecisionsView;
  uncertainties: TripContextUncertaintyView[];
  monitoring: TripContextMonitoringView;
  decisionHistory: TripContextDecisionHistoryItem[];
  /** Travel Compiler 产物（Trip.metadata.canonicalTravelGraph） */
  canonicalTravelGraph?: import('../../../travel-compiler/contracts/canonical-travel-graph.types').CanonicalTravelGraph;
  /** Travel Compiler 摘要 */
  travelCompilation?: TripContextTravelGraphView;
  /** Trip 范围 Ontology 事实（world_facts 表，factKey trip:{tripId}:） */
  tripOntologyFacts?: import('../../../travel-ontology/contracts/travel-world-fact.types').TravelWorldFact[];
  /** Ontology 约束摘要（Assembler 写入，供 BFF / Agent 只读） */
  ontologyConstraints?: {
    blockerCount: number;
    warningCount: number;
    missingEvidenceCount: number;
    codes: string[];
  };
}

export interface AssembleTripContextSnapshotOptions {
  /** Persist RFC-001 world snapshot binding (default false for read-only GET) */
  persistWorldBinding?: boolean;
}
