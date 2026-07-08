import type { UnifiedDecisionProblemDetailView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { OrchestrationStateView } from '../types/plan-proposal.types';
import type { PlanningDecisionPack } from '../types/planning-decision-pack.types';
import type {
  DecisionSpaceBundleInspector,
  DecisionSpaceBundleMeta,
  DecisionSpaceBundleNegotiation,
  DecisionSpaceBundleOrchestration,
  DecisionSpaceBundlePackFull,
  DecisionSpaceBundlePackSummary,
  DecisionSpaceBundleProblem,
  DecisionSpaceBundleModuleKey,
} from '../types/decision-space-bundle.types';
import type { PlanningDecisionInspector } from '../types/planning-decision-inspector.types';

export function projectBundleProblem(
  detail: UnifiedDecisionProblemDetailView,
): DecisionSpaceBundleProblem {
  const p = detail.problem;
  return {
    id: p.problemId,
    type: p.type,
    title: p.title,
    description: p.summary,
    status: p.phase,
    primaryEnforcement: p.enforcement,
    semanticKey: p.semanticKey,
    impactScopeView: p.scope,
    actions: detail.actions,
    resolution: detail.resolution,
    workflowStatus: p.workflowStatus,
    executionStatus: p.executionStatus,
    writeChain: detail.actionability?.writeChain,
    actionPlanId: detail.resolution?.actionPlanId,
    negotiation: detail.negotiation,
  };
}

export function projectBundleNegotiation(
  negotiation?: DecisionSpaceBundleProblem['negotiation'],
): DecisionSpaceBundleNegotiation | undefined {
  if (!negotiation) return undefined;
  return {
    visible: negotiation.visible,
    status: negotiation.status,
    buttonLabel: negotiation.buttonLabel,
    canStart: negotiation.canStart,
    closedOutcome: negotiation.closedOutcome,
  };
}

export function projectBundlePackSummary(
  pack: PlanningDecisionPack,
): DecisionSpaceBundlePackSummary {
  return {
    schema: 'tripnara.planning_decision_pack@v1',
    tripId: pack.tripId,
    proposalId: pack.proposalId,
    generatedAt: pack.generatedAt,
    validUntil: pack.monitor?.validUntil,
    options: pack.options.map((opt) => ({
      id: opt.id,
      label: opt.headline ?? opt.title,
      optionKind: opt.optionKind,
      recommended: opt.recommended,
      action: opt.action
        ? {
            actionId:
              typeof opt.action.payload?.actionId === 'string'
                ? opt.action.payload.actionId
                : undefined,
            type: opt.action.type,
          }
        : undefined,
      impactScope: opt.impactScope
        ? {
            scope: opt.impactScope.scope,
            affectedDays: opt.impactScope.affectedDays,
          }
        : undefined,
    })),
  };
}

export function projectBundlePackFull(pack: PlanningDecisionPack): DecisionSpaceBundlePackFull {
  return {
    schema: 'tripnara.planning_decision_pack@v1',
    tripId: pack.tripId,
    proposalId: pack.proposalId,
    generatedAt: pack.generatedAt,
    validUntil: pack.monitor?.validUntil,
    options: pack.options,
    decisionClusters: pack.decisionClusters,
    diagnostics: pack.diagnostics,
    monitor: pack.monitor,
  };
}

export function projectBundleOrchestration(
  state: OrchestrationStateView,
  pendingProposalCount: number,
): DecisionSpaceBundleOrchestration {
  return {
    activeProposalId: state.activeProposalId,
    pendingProposalCount,
    phase: state.phase,
    updatedAt: state.updatedAt,
  };
}

export function buildBundleEtag(input: {
  tripVersion: string;
  problemId?: string;
  proposalId?: string;
  optionId?: string;
  surfaceKey: string;
}): string {
  const parts = [
    'dsb',
    input.tripVersion,
    input.problemId ?? '-',
    input.proposalId ?? '-',
    input.optionId ?? '-',
    input.surfaceKey,
  ];
  return `W/"${parts.join(':')}"`;
}

export function buildBundleMeta(input: {
  tripId: string;
  included: DecisionSpaceBundleModuleKey[];
  deferred: DecisionSpaceBundleModuleKey[];
  inspector?: DecisionSpaceBundleInspector | PlanningDecisionInspector;
  problemId?: string;
  proposalId?: string;
  optionId?: string;
  conflictId?: string;
  previewRequiredForPlanDiff?: boolean;
}): DecisionSpaceBundleMeta {
  const includedLabels = input.included.map((m) =>
    m === 'pack.full' ? 'pack' : m === 'pack.summary' ? 'pack.summary' : m,
  );
  const deferredLabels = input.deferred.map((m) =>
    m === 'pack.full' ? 'pack' : m === 'pack.summary' ? 'pack.summary' : m,
  );

  const refreshHints: DecisionSpaceBundleMeta['refreshHints'] = {};
  if (input.problemId) {
    refreshHints.problem = `/api/trips/${input.tripId}/decision-problems/${input.problemId}`;
    if (input.optionId) {
      refreshHints.preview = `/api/trips/${input.tripId}/decision-problems/${input.problemId}/options/${input.optionId}/preview`;
    }
  }
  const inspectorParams = new URLSearchParams();
  if (input.proposalId) inspectorParams.set('proposalId', input.proposalId);
  if (input.problemId) inspectorParams.set('problemId', input.problemId);
  if (input.optionId) inspectorParams.set('optionId', input.optionId);
  if (input.conflictId) inspectorParams.set('conflictId', input.conflictId);
  refreshHints.inspector = `/api/trips/${input.tripId}/arrange-itinerary/decision-inspector?${inspectorParams.toString()}`;
  if (input.proposalId) {
    refreshHints.causalChain = `/api/trips/${input.tripId}/arrange-itinerary/decision-causal-chain?proposalId=${encodeURIComponent(input.proposalId)}`;
  } else if (input.problemId) {
    const causalParams = new URLSearchParams();
    causalParams.set('problemId', input.problemId);
    if (input.optionId) causalParams.set('optionId', input.optionId);
    refreshHints.causalChain = `/api/trips/${input.tripId}/arrange-itinerary/decision-causal-chain?${causalParams.toString()}`;
  } else {
    refreshHints.causalChain = `/api/trips/${input.tripId}/arrange-itinerary/decision-causal-chain`;
  }

  return {
    included: includedLabels,
    deferred: deferredLabels,
    tabEmptyState: input.inspector?.tabEmptyState,
    ...(input.previewRequiredForPlanDiff
      ? { deferredReason: { previewRequired: true } }
      : {}),
    refreshHints,
  };
}

export function sliceInspectorForBundle(
  inspector: PlanningDecisionInspector,
  modules: DecisionSpaceBundleModuleKey[],
  basisIncludedSeparately: boolean,
): DecisionSpaceBundleInspector {
  const sliced: DecisionSpaceBundleInspector = {
    schema: inspector.schema,
    tripId: inspector.tripId,
    mode: inspector.mode,
    proposalId: inspector.proposalId,
    problemId: inspector.problemId,
    optionId: inspector.optionId,
    generatedAt: inspector.generatedAt,
    refreshUrl: inspector.refreshUrl,
    tabEmptyState: inspector.tabEmptyState,
  };

  if (modules.includes('inspector.basis') && !basisIncludedSeparately) {
    sliced.decisionBasis = inspector.decisionBasis;
  }
  if (modules.includes('inspector.causalChain')) {
    sliced.causalChain = inspector.causalChain;
  }
  if (modules.includes('inspector.planDiff')) {
    sliced.planDiff = inspector.planDiff;
  }
  if (modules.includes('inspector.feasibility')) {
    sliced.feasibility = inspector.feasibility;
  }
  if (modules.includes('inspector.memberConsensus')) {
    sliced.memberConsensus = inspector.memberConsensus;
  }

  return sliced;
}
