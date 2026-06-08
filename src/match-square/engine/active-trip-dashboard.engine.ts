import { resolveContextualCardDefinitions } from '../config/trip-contextual-cards.config';
import { readActiveTripDecisionLoopFromMetadata } from './route-rollback-decision.engine';
import { readCollaborativeTaskFlywheelFromMetadata } from './collaborative-task-behavior.engine';
import {
  buildRouteContractLockView as buildVaultContractView,
  normalizeRouteContractLockMetadata,
} from './route-contract-lock.engine';
import type { RouteRollbackProposalView } from '../types/active-trip-decision.types';
import type {
  ActiveTripContextualCardView,
  ActiveTripCrewMemberView,
  ActiveTripDashboardView,
  ActiveTripMatchSquareContextView,
  ActiveTripSummaryView,
  ActiveTripTaskSummaryView,
  ActiveTripViewerAction,
  ActiveTripViewerContextView,
  ActiveTripViewerRole,
} from '../types/active-trip-dashboard.types';
import { ACTIVE_TRIP_DASHBOARD_VERSION } from '../types/active-trip-dashboard.types';
import type { CollaborativeTaskView } from '../types/recruitment-task-flywheel.types';
import type { RouteContractLockView } from '../types/route-contract-lock.types';

export interface MatchSquareInstantiationMetadata {
  recruitmentPostId?: string;
  strategy?: string;
  catalogId?: string | null;
  recruitmentScriptId?: string | null;
  vibeChipIds?: string[];
  toolchainIds?: string[];
  contextualCardIds?: string[];
  vaultMilestoneIds?: string[];
  sealedAt?: string | null;
  crewUserIds?: string[];
}

export interface BuildActiveTripDashboardInput {
  trip: ActiveTripSummaryView;
  metadata: unknown;
  viewerUserId: string;
  viewerRole: ActiveTripViewerRole;
  planningStyle?: string | null;
  crew: ActiveTripCrewMemberView[];
  requiredAuthorizations?: number;
}

function readMatchSquareInstantiation(metadata: unknown): MatchSquareInstantiationMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).matchSquareInstantiation;
  if (!raw || typeof raw !== 'object') return null;
  return raw as MatchSquareInstantiationMetadata;
}

function buildTaskSummary(tasks: CollaborativeTaskView[], viewerUserId: string): ActiveTripTaskSummaryView {
  const summary: ActiveTripTaskSummaryView = {
    total: tasks.length,
    pending: 0,
    confirmed: 0,
    rolledBack: 0,
    timedOut: 0,
    assignedToViewer: 0,
  };

  for (const task of tasks) {
    if (task.status === 'pending') summary.pending++;
    if (task.status === 'confirmed') summary.confirmed++;
    if (task.status === 'rolled_back') summary.rolledBack++;
    if (task.status === 'timed_out') summary.timedOut++;
    if (task.assigneeUserId === viewerUserId && task.status === 'pending') {
      summary.assignedToViewer++;
    }
  }
  return summary;
}

function resolveViewerAction(input: {
  viewerUserId: string;
  viewerRole: ActiveTripViewerRole;
  pendingRollback: RouteRollbackProposalView | null;
  tasks: CollaborativeTaskView[];
  routeContractLock: RouteContractLockView | null;
}): ActiveTripViewerAction {
  if (input.routeContractLock?.viewerCanAuthorize) {
    return 'authorize_vault_milestone';
  }

  const pending = input.pendingRollback;
  if (pending?.status === 'pending') {
    if (input.viewerRole === 'member' && !pending.confirmations.includes(input.viewerUserId)) {
      return 'confirm_rollback_proposal';
    }
  }

  const assignedPending = input.tasks.some(
    (t) => t.assigneeUserId === input.viewerUserId && t.status === 'pending',
  );
  if (assignedPending) return 'complete_assigned_task';

  return 'none';
}

function resolveRouteContractLockView(input: {
  metadata: unknown;
  viewerUserId: string;
  viewerRole: ActiveTripViewerRole;
  planningStyle?: string | null;
  instantiation: MatchSquareInstantiationMetadata | null;
  requiredAuthorizations: number;
}): RouteContractLockView | null {
  const raw = (input.metadata as Record<string, unknown>)?.routeContractLock;
  let lock = normalizeRouteContractLockMetadata(raw);

  if (!lock && input.instantiation?.vaultMilestoneIds?.length) {
    lock = normalizeRouteContractLockMetadata({
      milestoneIds: input.instantiation.vaultMilestoneIds,
      locked: false,
    });
  }

  if (!lock) return null;

  return buildVaultContractView({
    lock,
    viewerUserId: input.viewerUserId,
    viewerRole: input.viewerRole,
    planningStyle: input.planningStyle,
    requiredAuthorizations: input.requiredAuthorizations,
  });
}

export function buildActiveTripDashboardView(
  input: BuildActiveTripDashboardInput,
): ActiveTripDashboardView {
  const instantiation = readMatchSquareInstantiation(input.metadata);
  const flywheel = readCollaborativeTaskFlywheelFromMetadata(input.metadata);
  const decisionLoop = readActiveTripDecisionLoopFromMetadata(input.metadata);

  const tasks = flywheel?.tasks ?? [];
  const pendingRollback = decisionLoop?.pendingRollback ?? null;
  const requiredAuthorizations = input.requiredAuthorizations ?? Math.max(1, input.crew.length);

  const contextualCardIds = instantiation?.contextualCardIds ?? [];
  const cardDefs = resolveContextualCardDefinitions(contextualCardIds);
  const contextualCards: ActiveTripContextualCardView[] = cardDefs.map((c) => ({
    cardId: c.cardId,
    titleZh: c.titleZh,
    descriptionZh: c.descriptionZh,
    toolRoute: c.toolRoute,
    vaultLinked: c.vaultLinked,
    priority: c.priority,
  }));

  const matchSquare: ActiveTripMatchSquareContextView | null = instantiation?.recruitmentPostId
    ? {
        recruitmentPostId: instantiation.recruitmentPostId,
        strategy: instantiation.strategy ?? 'minimal_trip',
        catalogId: instantiation.catalogId ?? null,
        recruitmentScriptId: instantiation.recruitmentScriptId ?? null,
        vibeChipIds: instantiation.vibeChipIds ?? [],
        toolchainIds: instantiation.toolchainIds ?? [],
        contextualCardIds,
        sealedAt: instantiation.sealedAt ?? null,
      }
    : null;

  const routeContractLock = resolveRouteContractLockView({
    metadata: input.metadata,
    viewerUserId: input.viewerUserId,
    viewerRole: input.viewerRole,
    planningStyle: input.planningStyle,
    instantiation,
    requiredAuthorizations,
  });

  const viewer: ActiveTripViewerContextView = {
    userId: input.viewerUserId,
    role: input.viewerRole,
    canProposeRollback: input.viewerRole === 'captain',
    awaitingViewerAction: resolveViewerAction({
      viewerUserId: input.viewerUserId,
      viewerRole: input.viewerRole,
      pendingRollback,
      tasks,
      routeContractLock,
    }),
  };

  return {
    version: ACTIVE_TRIP_DASHBOARD_VERSION,
    trip: input.trip,
    viewer,
    matchSquare,
    contextualCards,
    crewDnaPanel: input.crew,
    collaborativeTasks: tasks,
    taskSummary: buildTaskSummary(tasks, input.viewerUserId),
    pendingRollback,
    decisionEventCount: decisionLoop?.eventLog?.length ?? 0,
    routeContractLock,
    apiPaths: {
      collaborativeTasks: `/trips/${input.trip.tripId}/collaborative-tasks`,
      decisionEvents: `/trips/${input.trip.tripId}/decision-events`,
      routeContractLock: `/trips/${input.trip.tripId}/route-contract-lock`,
      decisionReplay: `/trips/${input.trip.tripId}/decision-replay`,
      templateBackflowPreview: `/trips/${input.trip.tripId}/template-backflow/preview`,
      templateBackflowCommit: `/trips/${input.trip.tripId}/template-backflow/commit`,
      physicalFitnessEvents: `/trips/${input.trip.tripId}/physical-fitness-events`,
    },
  };
}
