/** PRD 3.12 — Active Trip Dashboard 聚合视图 Schema */

import type { RouteRollbackProposalView } from './active-trip-decision.types';
import type { CollaborativeTaskView } from './recruitment-task-flywheel.types';
import type { RouteContractLockView } from './route-contract-lock.types';

export const ACTIVE_TRIP_DASHBOARD_VERSION = 'active_trip_dashboard_v1' as const;

export type ActiveTripViewerRole = 'captain' | 'member';

export type ActiveTripViewerAction =
  | 'none'
  | 'confirm_rollback_proposal'
  | 'protest_rollback_proposal'
  | 'complete_assigned_task'
  | 'authorize_vault_milestone';

export interface ActiveTripSummaryView {
  tripId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface ActiveTripViewerContextView {
  userId: string;
  role: ActiveTripViewerRole;
  canProposeRollback: boolean;
  awaitingViewerAction: ActiveTripViewerAction;
}

export interface ActiveTripMatchSquareContextView {
  recruitmentPostId: string;
  strategy: string;
  catalogId: string | null;
  recruitmentScriptId: string | null;
  vibeChipIds: string[];
  toolchainIds: string[];
  contextualCardIds: string[];
  sealedAt: string | null;
}

export interface ActiveTripContextualCardView {
  cardId: string;
  titleZh: string;
  descriptionZh: string;
  toolRoute: string | null;
  vaultLinked: boolean;
  priority: 'critical' | 'high' | 'normal';
}

export interface ActiveTripCrewMemberView {
  userId: string;
  role: 'captain' | 'member';
  displayName: string;
  mbtiType: string | null;
  cardTitle: string | null;
  interactionModeLabel: string | null;
  reputationStars: number | null;
}

export interface ActiveTripTaskSummaryView {
  total: number;
  pending: number;
  confirmed: number;
  rolledBack: number;
  timedOut: number;
  assignedToViewer: number;
}

export type ActiveTripRouteContractLockView = RouteContractLockView;

export interface ActiveTripDashboardView {
  version: typeof ACTIVE_TRIP_DASHBOARD_VERSION;
  trip: ActiveTripSummaryView;
  viewer: ActiveTripViewerContextView;
  matchSquare: ActiveTripMatchSquareContextView | null;
  contextualCards: ActiveTripContextualCardView[];
  crewDnaPanel: ActiveTripCrewMemberView[];
  collaborativeTasks: CollaborativeTaskView[];
  taskSummary: ActiveTripTaskSummaryView;
  pendingRollback: RouteRollbackProposalView | null;
  decisionEventCount: number;
  routeContractLock: RouteContractLockView | null;
  /** 子 API 快捷路径（与 instantiate 响应一致） */
  apiPaths: {
    collaborativeTasks: string;
    decisionEvents: string;
    routeContractLock: string;
    decisionReplay: string;
    templateBackflowPreview: string;
    templateBackflowCommit: string;
    physicalFitnessEvents: string;
  };
}
