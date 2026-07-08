/**
 * P1 — L1 Decision Center overview read model.
 */

import type {
  ConstraintEnforcement,
  DecisionCenterOverview,
  DecisionExecutionSnapshot,
  DecisionProblemDetail,
  DecisionProblemSummary,
} from '../types/decision-semantics.types';
import { resolveDecisionExecutionStatus, toDecisionExecutionSnapshot } from '../execution/decision-execution-status.util';
import type { DecisionRecord } from '../types/decision-semantics.types';
import { qualifiesForDecisionQueue, inferEnforcementForQueue } from '../../../decision-runtime/gateway/utils/decision-queue-admission.util';

const ENFORCEMENT_HEADLINE: Record<ConstraintEnforcement, string> = {
  BLOCK: '有必须处理的旅行阻塞',
  REQUIRE_ADJUSTMENT: '建议尽快调整行程',
  REQUIRE_CONFIRMATION: '有事项等待您确认',
  WARN: '存在需要留意的风险',
  INFORM: '行程信息有更新',
};

export function buildDecisionCenterHeadline(
  byEnforcement: Partial<Record<ConstraintEnforcement, number>>,
  open: number,
): string {
  if (open === 0) return '当前没有待处理的旅行问题';

  const order: ConstraintEnforcement[] = [
    'BLOCK',
    'REQUIRE_ADJUSTMENT',
    'REQUIRE_CONFIRMATION',
    'WARN',
    'INFORM',
  ];

  for (const key of order) {
    const count = byEnforcement[key] ?? 0;
    if (count > 0) {
      return `${ENFORCEMENT_HEADLINE[key]}（${count} 项）`;
    }
  }

  return `有 ${open} 项待处理旅行问题`;
}

export function buildDecisionCenterOverview(input: {
  tripId: string;
  tripVersion: string;
  items: DecisionProblemSummary[];
  details: DecisionProblemDetail[];
  feasibility?: DecisionCenterOverview['feasibility'];
  recentRecords?: DecisionRecord[];
  actionableProblemIds?: Set<string>;
}): DecisionCenterOverview {
  const byEnforcement: Partial<Record<ConstraintEnforcement, number>> = {};
  const byStatus = input.items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as DecisionCenterOverview['problemCounts']['byStatus'],
  );

  for (const item of input.items) {
    if (item.status !== 'OPEN' && item.status !== 'WAITING_DECISION' && item.status !== 'ASSESSING') {
      continue;
    }
    const enforcement = inferEnforcementForQueue(item.primaryEnforcement ?? 'INFORM', {
      semanticKey: item.semanticKey,
      title: item.title,
      summary: item.title,
    });
    if (enforcement === 'INFORM') continue;
    if (
      !qualifiesForDecisionQueue({
        enforcement,
        workflowStatus: item.status,
        semanticKey: item.semanticKey,
        title: item.title,
        summary: item.title,
        blocksPlan: enforcement === 'BLOCK',
        requiresAdjustment: enforcement === 'REQUIRE_ADJUSTMENT',
        requiresConfirmation: enforcement === 'REQUIRE_CONFIRMATION',
      })
    ) {
      continue;
    }
    byEnforcement[enforcement] = (byEnforcement[enforcement] ?? 0) + 1;
  }

  const openStatuses = ['OPEN', 'WAITING_DECISION', 'ASSESSING'] as const;
  const queueEligibleItems = input.items.filter((item) => {
    if (!openStatuses.includes(item.status as (typeof openStatuses)[number])) return false;
    const enforcement = inferEnforcementForQueue(item.primaryEnforcement ?? 'INFORM', {
      semanticKey: item.semanticKey,
      title: item.title,
      summary: item.title,
    });
    return (
      enforcement !== 'INFORM' &&
      qualifiesForDecisionQueue({
        enforcement,
        workflowStatus: item.status,
        semanticKey: item.semanticKey,
        title: item.title,
        summary: item.title,
        blocksPlan: enforcement === 'BLOCK',
        requiresAdjustment: enforcement === 'REQUIRE_ADJUSTMENT',
        requiresConfirmation: enforcement === 'REQUIRE_CONFIRMATION',
      })
    );
  });

  const open = queueEligibleItems.length;

  const daySet = new Set<number>();
  const memberSet = new Set<string>();

  for (const detail of input.details) {
    for (const scope of detail.affectedScope) {
      if (scope.scopeType === 'DAY') {
        const n = Number(scope.scopeId);
        if (Number.isFinite(n)) daySet.add(n);
      }
      if (scope.scopeType === 'MEMBER') {
        memberSet.add(scope.scopeId);
      }
      for (const impact of scope.memberImpacts ?? []) {
        memberSet.add(impact.memberId);
      }
    }
  }

  for (const item of input.items) {
    for (const day of item.affectedDayNumbers ?? []) {
      daySet.add(day);
    }
  }

  const recentDecisions: DecisionExecutionSnapshot[] = (input.recentRecords ?? [])
    .slice(-5)
    .reverse()
    .map((record) =>
      toDecisionExecutionSnapshot(
        record,
        resolveDecisionExecutionStatus({ record }),
      ),
    );

  const blockingProblemCount = queueEligibleItems.filter(
    (i) => inferEnforcementForQueue(i.primaryEnforcement ?? 'WARN', { title: i.title }) === 'BLOCK',
  ).length;
  const waitingUserDecisionCount = queueEligibleItems.filter((i) => i.status === 'WAITING_DECISION').length;

  return {
    tripId: input.tripId,
    tripVersion: input.tripVersion,
    generatedAt: new Date().toISOString(),
    feasibility: input.feasibility,
    problemCounts: {
      total: input.items.length,
      open,
      byEnforcement,
      byStatus,
    },
    totalOpenProblemCount: open,
    affectedDayNumbers: [...daySet].sort((a, b) => a - b),
    affectedMemberIds: [...memberSet],
    headline: buildDecisionCenterHeadline(byEnforcement, open),
    actionableProblemCount: input.actionableProblemIds?.size ?? 0,
    blockingProblemCount,
    waitingUserDecisionCount,
    waitingTeamDecisionCount: 0,
    applyingCount: 0,
    staleEvidenceCount: 0,
    occurrenceCount: open,
    recentDecisions,
  };
}
