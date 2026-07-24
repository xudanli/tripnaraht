/**
 * @tripnara/unified-decision-contracts — RFC-002 Gateway + Canonical Runtime read surface.
 * Complements @tripnara/decision-semantics-contracts (Legacy V1.5).
 *
 * Import in frontend:
 *   import { UnifiedDecisionCenterView, classifyCanonicalL2Phase } from '@/generated/unified-decision-contracts';
 */

export type {
  AuthorizeDecisionGatewayInput,
  DecisionEngineId,
  DecisionRouteLineageEntry,
  DecisionRouteResult,
  DecisionSemanticKey,
  ExecuteDecisionGatewayInput,
  RouteResolution,
  UnifiedDecisionCenterView,
  /** @deprecated Use UnifiedDecisionProblemListItem from unified UI contract */
  UnifiedDecisionProblemFlow,
  /** @deprecated Use UnifiedDecisionProblemListItem from unified UI contract */
  UnifiedDecisionProblemListItem as LegacyUnifiedDecisionProblemListItem,
  /** @deprecated schema v1 — use UnifiedDecisionProblemListView v2 */
  UnifiedDecisionProblemListView as LegacyUnifiedDecisionProblemListView,
} from '../../decision-runtime/gateway/contracts/decision-gateway.types';

export type {
  ApplyDecisionProblemResponse,
  CollaborativeTaskRef,
  CreateDecisionCollaborativeSubTaskRequest,
  CreateDecisionCollaborativeSubTaskResponse,
  DeleteDecisionCollaborativeSubTaskResponse,
  DecisionAction,
  DecisionActionCommand,
  DecisionActionExpectedImpact,
  DecisionActionNavigationTarget,
  DecisionCollaborativeSubTaskKind,
  DecisionCollaborativeSubTaskStatus,
  DecisionCollaborativeSubTaskView,
  DecisionCollaborativeFollowUpSuggestion,
  DecisionDimension,
  DecisionProblemDetector,
  DecisionProblemOrigin,
  DecisionProblemExecutionStatus,
  DecisionProblemOccurrence,
  DecisionProblemPhase,
  DecisionProblemScope,
  DecisionProblemWorkflowStatus,
  DecisionResolutionSummary,
  DecisionWriteChain,
  ListDecisionCollaborativeSubTasksResponse,
  PatchDecisionCollaborativeSubTaskRequest,
  PatchDecisionCollaborativeSubTaskResponse,
  SubmitDecisionProblemResolutionRequest,
  SubmitDecisionProblemResolutionResponse,
  UpdateDecisionCollaborativeSubTaskRequest,
  UpdateDecisionCollaborativeSubTaskResponse,
  UnifiedDecisionActionPreviewView,
  UnifiedDecisionCenterOverviewView,
  UnifiedDecisionOptionsView,
  UnifiedDecisionProblemActionability,
  UnifiedDecisionProblemDebugMeta,
  UnifiedDecisionProblemDetailView,
  UnifiedDecisionProblemListItem,
  UnifiedDecisionProblemListView,
} from '../../decision-runtime/gateway/contracts/unified-decision-ui.types';

export type {
  Rfc001DecisionCenterCandidateView,
  Rfc001DecisionCenterProblemView,
  Rfc001DecisionCenterTripView,
  Rfc001DecisionLineageLink,
  Rfc001LeadingPersona,
} from '../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';

export type { Rfc001DecisionProblem } from '../../trips/guardian-decision-core/contracts/decision-problem.types';

export type {
  TripDecisionRoutingView,
  ProblemDecisionRoute,
  DecisionEngineCapability,
} from '../../trips/guardian-decision-core/routing/decision-engine-routing.types';

export type { ActiveDestinationPackSet } from '../../decision-runtime/packs/contracts/destination-pack.types';

export {
  classifyCanonicalL2Phase,
  isCanonicalL2Problem,
  personaLabelForSemanticCapability,
  shouldRefreshItineraryAfterCanonicalExecute,
  type CanonicalL2Phase,
  type CanonicalL2ProblemSignals,
} from '../../decision-runtime/gateway/frontend/canonical-decision-l2-state-machine.util';

export {
  buildSuggestedSubTasks,
  previewCollaborativeFollowUps,
  labelForCollaborativeSubTaskStatus,
  DECISION_COLLAB_SUBTASK_STATUS_OPTIONS,
} from '../../decision-runtime/gateway/frontend/decision-collaborative-subtask.util';
