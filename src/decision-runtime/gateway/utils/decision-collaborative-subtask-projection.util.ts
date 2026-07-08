import type { CollaborativeTaskItem } from '../../../trips/domain-influence/types/trip-domain.types';
import type { StoredDecisionProblemResolution } from '../persistence/decision-problem-resolution.store';
import type { StoredDecisionCollaborativeSubTask } from '../persistence/decision-collaborative-subtask.store';
import type { DecisionCollaborativeSubTaskView } from '../contracts/unified-decision-ui.types';
import { buildSuggestedSubTasks } from './decision-collaborative-subtask-suggestions.util';
import {
  composeCollaborativeSubTaskDisplayDescription,
  composeCollaborativeSubTaskDisplayTitle,
} from './decision-collaborative-subtask-display.util';
import { negotiationTaskIdForProblem } from '../../../trips/process-fairness/utils/decision-problem-negotiation.store';

function domainForCollaborativeSubTaskKind(
  kind: StoredDecisionCollaborativeSubTask['kind'],
): import('../../../trips/wishlist/types/trip-wish.types').WishCategory {
  switch (kind) {
    case 'ACCOMMODATION_LOOKUP':
    case 'CANCELLATION_POLICY':
      return 'accommodation';
    case 'BOOKING_FOLLOWUP':
      return 'activities';
    case 'TEAM_CONFIRM':
    case 'OTHER':
    default:
      return 'destination_route';
  }
}

function mapSubTaskStatus(status: StoredDecisionCollaborativeSubTask['status']): {
  status: CollaborativeTaskItem['status'];
  statusLabel: string;
} {
  const statusMap: Record<
    string,
    { status: CollaborativeTaskItem['status']; statusLabel: string }
  > = {
    pending: { status: 'pending', statusLabel: '待跟进' },
    in_progress: { status: 'in_discussion', statusLabel: '跟进中' },
    completed: { status: 'consensus_reached', statusLabel: '已完成' },
    cancelled: { status: 'pending', statusLabel: '已取消' },
  };
  return statusMap[status] ?? statusMap.pending;
}

export function storedSubTaskToView(
  stored: StoredDecisionCollaborativeSubTask,
): DecisionCollaborativeSubTaskView {
  return {
    id: stored.id,
    tripId: stored.tripId,
    problemId: stored.problemId,
    resolutionId: stored.resolutionId,
    actionPlanId: stored.actionPlanId,
    kind: stored.kind,
    title: stored.title,
    description: stored.description,
    status: stored.status,
    assigneeUserId: stored.assigneeUserId,
    problemTitle: stored.problemTitle,
    createdAt: stored.createdAt,
    createdByUserId: stored.createdByUserId,
  };
}

export function mapCollaborativeSubTaskItem(
  sub: StoredDecisionCollaborativeSubTask | DecisionCollaborativeSubTaskView,
  options?: { problemTitle?: string },
): CollaborativeTaskItem {
  const mapped = mapSubTaskStatus(sub.status);
  const storedProblemTitle =
    'problemTitle' in sub ? sub.problemTitle : undefined;
  const problemTitle = storedProblemTitle ?? options?.problemTitle;
  const displayTitle = composeCollaborativeSubTaskDisplayTitle(sub.title, problemTitle);

  return {
    id: sub.id,
    negotiationTaskId: negotiationTaskIdForProblem(sub.problemId),
    source: 'decision_problem',
    problemId: sub.problemId,
    decisionProblemId: sub.problemId,
    resolutionId: sub.resolutionId,
    actionPlanId: sub.actionPlanId ?? null,
    domain: domainForCollaborativeSubTaskKind(sub.kind),
    title: displayTitle,
    description: composeCollaborativeSubTaskDisplayDescription(
      sub.description,
      problemTitle,
    ),
    crossLevel: 'medium',
    status: mapped.status,
    statusLabel: mapped.statusLabel,
    claimCount: 0,
    leaderDisplayName: null,
    endorsementSummary: null,
    weightSource: 'manual',
    closesAt: null,
    activeRoundId: null,
    isSubTask: true,
    subTaskKind: sub.kind,
    subTaskStatus: sub.status,
    assigneeUserId: sub.assigneeUserId ?? null,
    problemTitle: problemTitle ?? null,
  };
}

export function mapSuggestedCollaborativeSubTaskItem(input: {
  problemId: string;
  title: string;
  description?: string;
  resolution: StoredDecisionProblemResolution;
  suggestion: ReturnType<typeof buildSuggestedSubTasks>[number];
}): CollaborativeTaskItem {
  const mapped = mapSubTaskStatus('pending');
  const problemTitle = input.title?.trim();
  const displayTitle = composeCollaborativeSubTaskDisplayTitle(
    input.suggestion.title,
    problemTitle,
  );

  return {
    id: `csub_suggested_${input.problemId}_${input.suggestion.kind.toLowerCase()}`,
    negotiationTaskId: negotiationTaskIdForProblem(input.problemId),
    source: 'decision_problem',
    problemId: input.problemId,
    decisionProblemId: input.problemId,
    resolutionId: input.resolution.resolutionId,
    actionPlanId: input.resolution.actionPlanId ?? null,
    domain: domainForCollaborativeSubTaskKind(input.suggestion.kind),
    title: displayTitle,
    description: composeCollaborativeSubTaskDisplayDescription(
      input.suggestion.description,
      problemTitle,
      input.description,
    ),
    crossLevel: 'medium',
    status: mapped.status,
    statusLabel: '建议跟进',
    claimCount: 0,
    leaderDisplayName: null,
    endorsementSummary: null,
    weightSource: 'manual',
    closesAt: null,
    activeRoundId: null,
    isSubTask: true,
    subTaskKind: input.suggestion.kind,
    subTaskStatus: 'pending',
    assigneeUserId: null,
    problemTitle: problemTitle ?? null,
  };
}
