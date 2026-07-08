/**
 * Arrange Itinerary BFF Client
 * Base: `/api/trips/:tripId/arrange-itinerary` + explore place/ai-actions
 */

export type {
  PlanningDecisionOptionKind,
  PlanningOptionLineItem,
  PlanningOptionDataBasisIcon,
  PlanningOptionDataBasis,
  PlanningImpactScope,
  PlanningCounterfactualRow,
  PlanningDecisionOption,
  PlanningDiagnostic,
  PlanningDecisionCluster,
  PlanningExecutionStep,
  PlanningDecisionMonitor,
  PlanningDecisionPack,
  PlanningProposalValidityView,
  CopilotSuggestion,
} from './frontend-planning-decision-pack.types';

export {
  OPTION_KIND_LABELS,
  DATA_BASIS_ICON_KEYS,
  getOptionDisplayTitle,
  getRecommendedOption,
  sortClustersByDependency,
  isProposalMutation,
  extractDecisionPack,
  shouldPollMonitor,
  buildApplyBodyFromOption,
  summarizeImpactScope,
  executionStepsFromApply,
} from './frontend-planning-decision-card.util';

export type {
  PlanningCausalChainNodeSeverity,
  PlanningCausalChainNodeSource,
  PlanningCausalChainBasisSource,
  PlanningCausalChainNode,
  PlanningDecisionCausalChain,
} from './frontend-planning-causal-chain.types';

export {
  CAUSAL_CHAIN_SEVERITY_COLORS,
  formatCausalChainBasisAge,
} from './frontend-planning-causal-chain.types';

export type {
  PlanningDecisionBasisFieldIcon,
  PlanningWhatHappened,
  PlanningDecisionBasisField,
  PlanningDecisionBasis,
} from './frontend-planning-decision-basis.types';

export { DECISION_BASIS_FIELD_ICON_KEYS } from './frontend-planning-decision-basis.types';

export type { PlanningDecisionInspector } from './frontend-planning-decision-inspector.types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

function tripBase(tripId: string) {
  return `/api/trips/${tripId}`;
}

async function request<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    throw new Error((json as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return json.data;
}

export type PlanProposalCommitMode = 'proposal' | 'direct';

export type OrchestrationPhase =
  | 'IDLE'
  | 'ANALYZING'
  | 'GENERATING'
  | 'VALIDATING'
  | 'PREVIEW'
  | 'AWAITING_CONFIRMATION'
  | 'APPLYING'
  | 'COMPLETED'
  | 'CONTEXT_STALE'
  | 'NO_FEASIBLE_PLAN'
  | 'PARTIAL_RESULT'
  | 'FAILED';

export type OrchestrationState = {
  tripId: string;
  phase: OrchestrationPhase;
  activeProposalId?: string;
  contextVersion: number;
  message?: string;
  updatedAt: string;
};

import type { PlanningDecisionPack } from './frontend-planning-decision-pack.types';

export type PlanProposal = {
  proposalId: string;
  tripId: string;
  intent: string;
  basePlanVersion: number;
  contextVersion: number;
  affectedDays: number[];
  changes: Array<Record<string, unknown>>;
  benefits?: Record<string, unknown>;
  tradeoffs: string[];
  validation: {
    status: 'PASS' | 'WARN' | 'BLOCK';
    warnings: string[];
    conflicts: Array<Record<string, unknown>>;
  };
  diff: { summary: string; timelineChanges: Array<Record<string, unknown>> };
  requiresConfirmation: boolean;
  status: string;
  answer?: string;
  createdAt: string;
  expiresAt: string;
  decisionPack?: PlanningDecisionPack;
};

export type PlanProposalMutationResponse = {
  mode: PlanProposalCommitMode;
  tripId: string;
  orchestrationState: OrchestrationState;
  proposal?: PlanProposal;
  action?: string;
  answer?: string;
  suggestedActions?: Array<Record<string, unknown>>;
  itineraryItem?: Record<string, unknown>;
  scheduleTimeline?: { tripId: string; days: unknown[] };
  candidates?: unknown;
  taskId?: string;
  status?: string;
  itemCount?: number;
};

export type PlanProposalApplyResult = {
  proposalId: string;
  tripId: string;
  status: 'APPLIED';
  orchestrationState: OrchestrationState;
  appliedChangeCount: number;
  scheduleTimeline?: { tripId: string; days: unknown[] };
  candidates?: unknown;
  itineraryItems?: Array<Record<string, unknown>>;
  executionSteps?: import('./frontend-planning-decision-pack.types').PlanningExecutionStep[];
  validUntil?: string;
  monitorWebhookUrl?: string;
};

export type ArrangeItineraryOverview = {
  tripId: string;
  dayCount: number;
  nights: number;
  totalDriveMinutes: number | null;
  totalDistanceKm: number | null;
  activityCount: number;
  routeSpanKm: number | null;
  unplacedCandidateCount: number;
  pacingLabel: string | null;
  transportLabel: string | null;
  departureLabel: string | null;
};

export type ArrangeItineraryAiAction =
  | 'fill_gaps'
  | 'optimize_route'
  | 'arrange_lunch'
  | 'reduce_intensity';

export type PlanningIntent =
  | 'PLACE_CANDIDATE'
  | 'ADD_ITEM'
  | 'INSERT_REST_GAP'
  | 'AUTO_ARRANGE'
  | 'FILL_GAP'
  | 'OPTIMIZE_ROUTE'
  | 'ARRANGE_LUNCH'
  | 'REDUCE_INTENSITY';

export async function fetchOrchestrationState(
  token: string,
  tripId: string,
): Promise<OrchestrationState> {
  return request(`${tripBase(tripId)}/arrange-itinerary/orchestration-state`, token);
}

export async function listPlanProposals(
  token: string,
  tripId: string,
): Promise<{ tripId: string; proposals: PlanProposal[] }> {
  return request(`${tripBase(tripId)}/arrange-itinerary/proposals`, token);
}

export async function getPlanProposal(
  token: string,
  tripId: string,
  proposalId: string,
): Promise<PlanProposal> {
  return request(`${tripBase(tripId)}/arrange-itinerary/proposals/${proposalId}`, token);
}

export async function createPlanProposal(
  token: string,
  tripId: string,
  body: { intent: PlanningIntent; payload: Record<string, unknown> },
): Promise<PlanProposalMutationResponse> {
  return request(`${tripBase(tripId)}/arrange-itinerary/proposals`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function applyPlanProposal(
  token: string,
  tripId: string,
  proposalId: string,
  body?: { contextVersion?: number; force?: boolean },
): Promise<PlanProposalApplyResult> {
  return request(`${tripBase(tripId)}/arrange-itinerary/proposals/${proposalId}/apply`, token, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function fetchProposalMonitor(
  token: string,
  tripId: string,
  proposalId: string,
): Promise<import('./frontend-planning-decision-pack.types').PlanningProposalValidityView> {
  return request(
    `${tripBase(tripId)}/arrange-itinerary/proposals/${proposalId}/monitor`,
    token,
  );
}

export async function fetchDecisionCausalChain(
  token: string,
  tripId: string,
  opts?: { proposalId?: string; problemId?: string; optionId?: string },
): Promise<import('./frontend-planning-causal-chain.types').PlanningDecisionCausalChain> {
  const params = new URLSearchParams();
  if (opts?.proposalId) params.set('proposalId', opts.proposalId);
  if (opts?.problemId) params.set('problemId', opts.problemId);
  if (opts?.optionId) params.set('optionId', opts.optionId);
  const query = params.toString() ? `?${params}` : '';
  return request(`${tripBase(tripId)}/arrange-itinerary/decision-causal-chain${query}`, token);
}

export async function fetchDecisionBasis(
  token: string,
  tripId: string,
  opts?: { conflictId?: string; proposalId?: string; problemId?: string },
): Promise<import('./frontend-planning-decision-basis.types').PlanningDecisionBasis> {
  const params = new URLSearchParams();
  if (opts?.conflictId) params.set('conflictId', opts.conflictId);
  if (opts?.proposalId) params.set('proposalId', opts.proposalId);
  if (opts?.problemId) params.set('problemId', opts.problemId);
  const query = params.toString() ? `?${params}` : '';
  return request(`${tripBase(tripId)}/arrange-itinerary/decision-basis${query}`, token);
}

export async function fetchDecisionSpaceBundle(
  token: string,
  tripId: string,
  opts: {
    problemId?: string;
    proposalId?: string;
    conflictId?: string;
    focusConflictId?: string;
    optionId?: string;
    surface?: 'default' | 'middle' | 'inspector' | 'full';
    include?: string;
    exclude?: string;
  },
): Promise<import('../types/decision-space-bundle.types').DecisionSpaceBundle> {
  const params = new URLSearchParams();
  if (opts.problemId) params.set('problemId', opts.problemId);
  if (opts.proposalId) params.set('proposalId', opts.proposalId);
  if (opts.conflictId) params.set('conflictId', opts.conflictId);
  if (opts.focusConflictId) params.set('focusConflictId', opts.focusConflictId);
  if (opts.optionId) params.set('optionId', opts.optionId);
  if (opts.surface) params.set('surface', opts.surface);
  if (opts.include) params.set('include', opts.include);
  if (opts.exclude) params.set('exclude', opts.exclude);
  return request(`${tripBase(tripId)}/decision-space-bundle?${params}`, token);
}

export async function fetchDecisionInspector(
  token: string,
  tripId: string,
  opts: {
    proposalId?: string;
    problemId?: string;
    optionId?: string;
    conflictId?: string;
  },
): Promise<import('./frontend-planning-decision-inspector.types').PlanningDecisionInspector> {
  const params = new URLSearchParams();
  if (opts.proposalId) params.set('proposalId', opts.proposalId);
  if (opts.problemId) params.set('problemId', opts.problemId);
  if (opts.optionId) params.set('optionId', opts.optionId);
  if (opts.conflictId) params.set('conflictId', opts.conflictId);
  return request(
    `${tripBase(tripId)}/arrange-itinerary/decision-inspector?${params}`,
    token,
  );
}

export async function discardPlanProposal(
  token: string,
  tripId: string,
  proposalId: string,
): Promise<PlanProposal> {
  return request(`${tripBase(tripId)}/arrange-itinerary/proposals/${proposalId}/discard`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export type PlanningWorkbenchMode = 'manual' | 'copilot';

export async function fetchCopilotSuggestions(token: string, tripId: string) {
  return request(`${tripBase(tripId)}/arrange-itinerary/copilot-suggestions`, token);
}

export async function runCopilotAction(
  token: string,
  tripId: string,
  body: {
    action: 'draft_for_candidate' | 'draft_all_must_go' | 'fill_gaps' | 'execute_suggestion';
    candidateId?: string;
    suggestionId?: string;
    dayIndex?: number;
  },
): Promise<PlanProposalMutationResponse> {
  return request(`${tripBase(tripId)}/arrange-itinerary/copilot-actions`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchPlanningWorkbenchSnapshot(token: string, tripId: string) {
  return request(`${tripBase(tripId)}/arrange-itinerary/planning-workbench-snapshot`, token);
}

export async function fetchPlanningMode(token: string, tripId: string) {
  return request<{ tripId: string; mode: PlanningWorkbenchMode; description: string }>(
    `${tripBase(tripId)}/arrange-itinerary/planning-mode`,
    token,
  );
}

export async function updatePlanningMode(
  token: string,
  tripId: string,
  mode: PlanningWorkbenchMode,
) {
  return request(`${tripBase(tripId)}/arrange-itinerary/planning-mode`, token, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export async function fetchItemLocks(token: string, tripId: string) {
  return request(`${tripBase(tripId)}/arrange-itinerary/item-locks`, token);
}

export async function analyzeItineraryItemMove(
  token: string,
  tripId: string,
  itemId: string,
  body: { dayIndex: number; startTime: string; endTime?: string },
): Promise<PlanProposalMutationResponse> {
  return request(`${tripBase(tripId)}/arrange-itinerary/items/${itemId}/analyze-move`, token, {
    method: 'POST',
    body: JSON.stringify({ ...body, commitMode: 'proposal' }),
  });
}

export async function fetchArrangeItineraryOverview(
  token: string,
  tripId: string,
): Promise<ArrangeItineraryOverview> {
  return request(`${tripBase(tripId)}/arrange-itinerary/overview`, token);
}

export async function placeAttractionExploreCandidate(
  token: string,
  tripId: string,
  candidateId: string,
  body: {
    dayIndex: number;
    startTime?: string;
    endTime?: string;
    insertMode?: 'append' | 'before' | 'after';
    anchorItemId?: string;
    removeFromCandidates?: boolean;
    commitMode?: PlanProposalCommitMode;
  },
): Promise<PlanProposalMutationResponse> {
  return request(
    `${tripBase(tripId)}/attraction-explore/candidates/${candidateId}/place`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function autoArrangeAttractionExplore(
  token: string,
  tripId: string,
  body?: { candidateIds?: string[]; commitMode?: PlanProposalCommitMode },
): Promise<PlanProposalMutationResponse> {
  return request(`${tripBase(tripId)}/attraction-explore/auto-arrange`, token, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function createArrangeItineraryItem(
  token: string,
  tripId: string,
  body: {
    dayIndex: number;
    type: string;
    startTime: string;
    endTime: string;
    placeId?: number;
    note?: string;
    placeName?: string;
    insertMode?: 'append' | 'before' | 'after';
    anchorItemId?: string;
    forceCreate?: boolean;
    commitMode?: PlanProposalCommitMode;
  },
): Promise<PlanProposalMutationResponse> {
  return request(`${tripBase(tripId)}/arrange-itinerary/items`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createArrangeItineraryGap(
  token: string,
  tripId: string,
  body: {
    dayIndex: number;
    startTime: string;
    endTime: string;
    label?: string;
    commitMode?: PlanProposalCommitMode;
  },
): Promise<PlanProposalMutationResponse> {
  return request(`${tripBase(tripId)}/arrange-itinerary/gaps`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function runArrangeItineraryAiAction(
  token: string,
  tripId: string,
  body: {
    action: ArrangeItineraryAiAction;
    dayIndex?: number;
    candidateIds?: string[];
    commitMode?: PlanProposalCommitMode;
  },
  viaExplorePath = false,
): Promise<PlanProposalMutationResponse> {
  const path = viaExplorePath ? 'attraction-explore/ai-actions' : 'arrange-itinerary/ai-actions';
  return request(`${tripBase(tripId)}/${path}`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
