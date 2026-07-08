/**
 * 决策空间 Bundle — 首屏读路径聚合 envelope
 * @see src/trips/decision-semantics/DECISION_SPACE_BUNDLE_API.md
 */

import type { DecisionAction } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { DecisionResolutionSummary } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { DecisionProblemNegotiationView } from '../../decision-semantics/types/decision-semantics.types';
import type { PlanningDecisionBasis } from './planning-decision-basis.types';
import type {
  PlanningDecisionInspector,
  PlanningInspectorTabEmptyState,
} from './planning-decision-inspector.types';
import type { PlanningDecisionOptionKind } from './planning-decision-pack.types';
import type { OrchestrationPhase } from './plan-proposal.types';

export type DecisionSpaceBundleInspector = Pick<
  PlanningDecisionInspector,
  'schema' | 'tripId' | 'mode' | 'generatedAt' | 'refreshUrl' | 'tabEmptyState'
> &
  Partial<
    Pick<
      PlanningDecisionInspector,
      | 'proposalId'
      | 'problemId'
      | 'optionId'
      | 'decisionBasis'
      | 'causalChain'
      | 'planDiff'
      | 'memberConsensus'
      | 'feasibility'
    >
  >;

export type DecisionSpaceBundleSurface = 'default' | 'middle' | 'inspector' | 'full';

export type DecisionSpaceBundleModuleKey =
  | 'problem'
  | 'basis'
  | 'pack.summary'
  | 'pack.full'
  | 'inspector.causalChain'
  | 'inspector.planDiff'
  | 'inspector.feasibility'
  | 'inspector.memberConsensus'
  | 'inspector.basis'
  | 'negotiation'
  | 'orchestration';

export interface DecisionSpaceBundleQuery {
  problemId?: string;
  proposalId?: string;
  conflictId?: string;
  focusConflictId?: string;
  optionId?: string;
  surface?: DecisionSpaceBundleSurface;
  include?: string;
  exclude?: string;
}

export interface DecisionSpaceBundleProblem {
  id: string;
  type: string;
  title: string;
  description?: string;
  status?: string;
  primaryEnforcement?: string;
  semanticKey?: string;
  impactScopeView?: unknown;
  affectedScopeDisplay?: unknown;
  evidenceValidUntil?: string;
  actions: DecisionAction[];
  resolution?: DecisionResolutionSummary;
  workflowStatus?: string;
  executionStatus?: string;
  writeChain?: string;
  actionPlanId?: string;
  memberImpacts?: unknown;
  negotiation?: DecisionProblemNegotiationView;
}

export interface DecisionSpaceBundlePackSummaryOption {
  id: string;
  label: string;
  optionKind: PlanningDecisionOptionKind;
  recommended?: boolean;
  action?: {
    actionId?: string;
    type?: string;
  };
  impactScope?: {
    scope: string;
    affectedDays?: number[];
  };
}

export interface DecisionSpaceBundlePackSummary {
  schema: 'tripnara.planning_decision_pack@v1';
  tripId: string;
  proposalId?: string;
  generatedAt?: string;
  options: DecisionSpaceBundlePackSummaryOption[];
  validUntil?: string;
}

export interface DecisionSpaceBundlePackFull {
  schema: 'tripnara.planning_decision_pack@v1';
  tripId: string;
  proposalId?: string;
  generatedAt?: string;
  validUntil?: string;
  options: import('./planning-decision-pack.types').PlanningDecisionOption[];
  decisionClusters?: import('./planning-decision-pack.types').PlanningDecisionCluster[];
  diagnostics?: import('./planning-decision-pack.types').PlanningDiagnostic[];
  monitor?: import('./planning-decision-pack.types').PlanningDecisionMonitor;
}

export interface DecisionSpaceBundleNegotiation {
  visible: boolean;
  status?: string;
  buttonLabel?: string | null;
  canStart?: boolean;
  closedOutcome?: DecisionProblemNegotiationView['closedOutcome'];
}

export interface DecisionSpaceBundleOrchestration {
  activeProposalId?: string;
  pendingProposalCount?: number;
  phase?: OrchestrationPhase;
  updatedAt?: string;
}

export interface DecisionSpaceBundleMeta {
  included: string[];
  deferred: string[];
  tabEmptyState?: PlanningInspectorTabEmptyState;
  deferredReason?: {
    previewRequired?: boolean;
  };
  refreshHints?: {
    problem?: string;
    preview?: string;
    inspector?: string;
    causalChain?: string;
  };
}

export interface DecisionSpaceBundleBinding {
  problemId?: string;
  proposalId?: string;
  conflictId?: string;
  optionId?: string;
  mode: 'problem' | 'proposal';
}

export interface DecisionSpaceBundle {
  schema: 'tripnara.decision_space_bundle@v1';
  tripId: string;
  generatedAt: string;
  tripVersion: string;
  etag: string;
  binding: DecisionSpaceBundleBinding;
  problem?: DecisionSpaceBundleProblem;
  basis?: PlanningDecisionBasis;
  pack?: DecisionSpaceBundlePackSummary | DecisionSpaceBundlePackFull;
  inspector?: DecisionSpaceBundleInspector;
  negotiation?: DecisionSpaceBundleNegotiation;
  orchestration?: DecisionSpaceBundleOrchestration;
  meta: DecisionSpaceBundleMeta;
}
