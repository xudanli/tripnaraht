import { randomUUID } from 'crypto';
import type {
  ActiveTripDecisionEventRecord,
  ActiveTripDecisionLoopMetadata,
  RouteRollbackAction,
  RouteRollbackProposalView,
} from '../types/active-trip-decision.types';
import { ACTIVE_TRIP_DECISION_LOOP_VERSION } from '../types/active-trip-decision.types';

export interface ApplyRouteRollbackEventInput {
  loop: ActiveTripDecisionLoopMetadata;
  action: RouteRollbackAction;
  actorUserId: string;
  actorRole: 'captain' | 'member';
  memberCollaboratorCount: number;
  planBRef?: string;
  milestoneId?: string | null;
  evidenceRefs?: string[];
  note?: string | null;
  at?: string;
}

export interface ApplyRouteRollbackEventResult {
  loop: ActiveTripDecisionLoopMetadata;
  pendingRollback: RouteRollbackProposalView | null;
  event: ActiveTripDecisionEventRecord;
  dnaReasons: Array<'NEGOTIATION_CONFIRMED' | 'NEGOTIATION_ROLLED_BACK'>;
  notifyUserIds: string[];
  awaitingMemberConfirmations: boolean;
}

export function readActiveTripDecisionLoopFromMetadata(
  metadata: unknown,
): ActiveTripDecisionLoopMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).activeTripDecisionLoop;
  if (!raw || typeof raw !== 'object') return null;
  const loop = raw as ActiveTripDecisionLoopMetadata;
  if (loop.version !== ACTIVE_TRIP_DECISION_LOOP_VERSION) return null;
  if (!Array.isArray(loop.eventLog)) return null;
  return loop;
}

export function emptyActiveTripDecisionLoop(): ActiveTripDecisionLoopMetadata {
  return {
    version: ACTIVE_TRIP_DECISION_LOOP_VERSION,
    pendingRollback: null,
    eventLog: [],
  };
}

function requiredMemberConfirmations(memberCollaboratorCount: number): number {
  return Math.max(1, memberCollaboratorCount);
}

function allMembersConfirmed(
  proposal: RouteRollbackProposalView,
  memberCollaboratorCount: number,
): boolean {
  const required = requiredMemberConfirmations(memberCollaboratorCount);
  return proposal.confirmations.length >= required;
}

export function applyRouteRollbackDecisionEvent(
  input: ApplyRouteRollbackEventInput,
): ApplyRouteRollbackEventResult {
  const at = input.at ?? new Date().toISOString();
  const loop = input.loop ?? emptyActiveTripDecisionLoop();

  if (input.action === 'propose') {
    if (input.actorRole !== 'captain') {
      throw new Error('仅队长可发起路线 Rollback 提案');
    }
    if (loop.pendingRollback?.status === 'pending') {
      throw new Error('已有待确认的 Rollback 提案');
    }
    if (!input.planBRef?.trim()) {
      throw new Error('planBRef 必填');
    }

    const proposalId = randomUUID();
    const proposal: RouteRollbackProposalView = {
      proposalId,
      proposedByUserId: input.actorUserId,
      planBRef: input.planBRef.trim(),
      milestoneId: input.milestoneId ?? null,
      evidenceRefs: input.evidenceRefs ?? [],
      note: input.note ?? null,
      proposedAt: at,
      status: 'pending',
      confirmations: [],
      protests: [],
      requiredConfirmations: requiredMemberConfirmations(input.memberCollaboratorCount),
      confirmLatencyMs: null,
    };

    const event: ActiveTripDecisionEventRecord = {
      eventId: randomUUID(),
      type: 'route_rollback',
      action: 'propose',
      actorUserId: input.actorUserId,
      at,
      proposalId,
      planBRef: proposal.planBRef,
      milestoneId: proposal.milestoneId,
      note: input.note ?? null,
    };

    const nextLoop: ActiveTripDecisionLoopMetadata = {
      ...loop,
      pendingRollback: proposal,
      eventLog: [...loop.eventLog, event],
    };

    return {
      loop: nextLoop,
      pendingRollback: proposal,
      event,
      dnaReasons: [],
      notifyUserIds: [],
      awaitingMemberConfirmations: input.memberCollaboratorCount > 0,
    };
  }

  const pending = loop.pendingRollback;
  if (!pending || pending.status !== 'pending') {
    throw new Error('当前无待处理的 Rollback 提案');
  }

  if (input.action === 'confirm') {
    if (input.actorRole !== 'member') {
      throw new Error('队员确认请由非队长协作者提交');
    }
    if (pending.protests.length > 0) {
      throw new Error('提案已被拒绝，无法确认');
    }
    if (pending.confirmations.includes(input.actorUserId)) {
      throw new Error('您已确认过该提案');
    }

    const confirmations = [...pending.confirmations, input.actorUserId];
    const confirmed = allMembersConfirmed(
      { ...pending, confirmations },
      input.memberCollaboratorCount,
    );

    const confirmLatencyMs = confirmed
      ? Math.max(0, Date.parse(at) - Date.parse(pending.proposedAt))
      : null;

    const updatedProposal: RouteRollbackProposalView = {
      ...pending,
      confirmations,
      status: confirmed ? 'confirmed' : 'pending',
      confirmLatencyMs,
    };

    const event: ActiveTripDecisionEventRecord = {
      eventId: randomUUID(),
      type: 'route_rollback',
      action: 'confirm',
      actorUserId: input.actorUserId,
      at,
      proposalId: pending.proposalId,
      note: input.note ?? null,
    };

    const dnaReasons: ApplyRouteRollbackEventResult['dnaReasons'] = confirmed
      ? ['NEGOTIATION_CONFIRMED']
      : [];

    const nextLoop: ActiveTripDecisionLoopMetadata = {
      ...loop,
      pendingRollback: confirmed ? null : updatedProposal,
      eventLog: [...loop.eventLog, event],
    };

    if (confirmed) {
      nextLoop.eventLog.push({
        eventId: randomUUID(),
        type: 'route_rollback',
        action: 'confirm',
        actorUserId: 'system',
        at,
        proposalId: pending.proposalId,
        note: 'route.rollback_confirmed',
      });
    }

    return {
      loop: nextLoop,
      pendingRollback: confirmed ? null : updatedProposal,
      event,
      dnaReasons,
      notifyUserIds: confirmed ? [pending.proposedByUserId, ...confirmations] : [],
      awaitingMemberConfirmations: !confirmed,
    };
  }

  if (input.action === 'protest') {
    if (input.actorRole !== 'member') {
      throw new Error('队员异议请由非队长协作者提交');
    }

    const updatedProposal: RouteRollbackProposalView = {
      ...pending,
      status: 'protested',
      protests: [...pending.protests, input.actorUserId],
    };

    const event: ActiveTripDecisionEventRecord = {
      eventId: randomUUID(),
      type: 'route_rollback',
      action: 'protest',
      actorUserId: input.actorUserId,
      at,
      proposalId: pending.proposalId,
      note: input.note ?? null,
    };

    const nextLoop: ActiveTripDecisionLoopMetadata = {
      ...loop,
      pendingRollback: null,
      eventLog: [...loop.eventLog, event],
    };

    return {
      loop: nextLoop,
      pendingRollback: null,
      event,
      dnaReasons: ['NEGOTIATION_ROLLED_BACK'],
      notifyUserIds: [pending.proposedByUserId, input.actorUserId],
      awaitingMemberConfirmations: false,
    };
  }

  throw new Error('不支持的操作');
}
