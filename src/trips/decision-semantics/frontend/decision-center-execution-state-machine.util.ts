/**
 * Decision Center L4 — Release Gate execution state machine (V1.6.2).
 *
 * Frontend SSOT aligned with DECISION_SEMANTICS_FRONTEND_API.md §4.1.
 * Import from `@/generated/decision-semantics-contracts` or this path.
 */

import type {
  CreateDecisionResponse,
  DecisionAuthority,
  DecisionExecutionStatus,
  DecisionExecutionStatusResponse,
  DecisionPostApplyCoherenceV1,
} from '../types/decision-semantics.types';

const POLL_STUB_AUTHORITY: DecisionAuthority = {
  decisionDomain: 'ROUTE',
  proposer: 'SYSTEM',
  requiredApprover: 'SYSTEM',
  executionMode: 'AUTO',
  overridable: false,
};

/** Polling stops when status is in this set (§5.1). */
export const DECISION_EXECUTION_TERMINAL_STATUSES: ReadonlySet<DecisionExecutionStatus> =
  new Set([
    'APPLIED',
    'RESOLVED',
    'FAILED',
    'RECORDED',
    'IDEMPOTENT_REPLAY',
    'PARTIALLY_APPLIED',
    'ROLLED_BACK',
  ]);

export type DecisionExecutionUiVariant =
  | 'success'
  | 'in_progress'
  | 'warning_needs_repair'
  | 'neutral_replay'
  | 'error_failed'
  | 'error_rolled_back'
  | 'blocked_stale_evidence';

export type ClassifiedDecisionOutcome = {
  variant: DecisionExecutionUiVariant;
  /** User-visible primary copy — prefer API `explanation` when polling */
  defaultTitle: string;
  shouldRefreshItinerary: boolean;
  shouldShowSuccessToast: boolean;
  isTerminal: boolean;
  needsRepair: boolean;
  effectiveDecisionId?: string;
  staleEvidenceTypes?: string[];
};

function isPartiallyApplied(input: {
  needsRepair?: boolean;
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
  executionStatus?: DecisionExecutionStatus;
}): boolean {
  return (
    input.needsRepair === true ||
    input.postApplyCoherence?.outcome === 'PARTIALLY_APPLIED' ||
    input.executionStatus === 'PARTIALLY_APPLIED'
  );
}

function isIdempotentReplay(response: Pick<
  CreateDecisionResponse,
  'executionStatus' | 'idempotentReplay'
>): boolean {
  return (
    response.idempotentReplay === true || response.executionStatus === 'IDEMPOTENT_REPLAY'
  );
}

function isRolledBack(input: {
  executionStatus?: DecisionExecutionStatus;
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
}): boolean {
  return (
    input.executionStatus === 'ROLLED_BACK' ||
    input.postApplyCoherence?.outcome === 'ROLLED_BACK'
  );
}

/** Classify POST /decisions synchronous response — drives L4 result panel. */
export function classifyCreateDecisionOutcome(
  response: CreateDecisionResponse,
): ClassifiedDecisionOutcome {
  const executionStatus = response.executionStatus;
  const effectiveDecisionId = response.effectiveDecisionId ?? response.decision.id;

  if (response.evidenceFreshnessBlock?.blocked) {
    return {
      variant: 'blocked_stale_evidence',
      defaultTitle:
        response.evidenceFreshnessBlock.message ??
        '路况/天气依据已过期，请刷新后再应用方案',
      shouldRefreshItinerary: false,
      shouldShowSuccessToast: false,
      isTerminal: true,
      needsRepair: false,
      staleEvidenceTypes: response.evidenceFreshnessBlock.staleEvidenceTypes,
    };
  }

  if (isIdempotentReplay(response)) {
    return {
      variant: 'neutral_replay',
      defaultTitle: '该方案已处理过，未重复修改行程',
      shouldRefreshItinerary: false,
      shouldShowSuccessToast: false,
      isTerminal: true,
      needsRepair: false,
      effectiveDecisionId: response.effectiveDecisionId ?? response.decision.effectiveDecisionId,
    };
  }

  if (isRolledBack({ executionStatus, postApplyCoherence: response.postApplyCoherence })) {
    return {
      variant: 'error_rolled_back',
      defaultTitle:
        response.postApplyCoherence?.failureMessage ??
        '方案未能完整应用，行程已恢复至修改前',
      shouldRefreshItinerary: true,
      shouldShowSuccessToast: false,
      isTerminal: true,
      needsRepair: false,
      effectiveDecisionId,
    };
  }

  if (
    isPartiallyApplied({
      needsRepair: response.needsRepair,
      postApplyCoherence: response.postApplyCoherence,
      executionStatus,
    })
  ) {
    return {
      variant: 'warning_needs_repair',
      defaultTitle:
        response.postApplyCoherence?.failureMessage ??
        '行程已部分更新，路线重算未完成，需继续修复',
      shouldRefreshItinerary: true,
      shouldShowSuccessToast: false,
      isTerminal: true,
      needsRepair: true,
      effectiveDecisionId,
    };
  }

  if (executionStatus === 'FAILED') {
    return {
      variant: 'error_failed',
      defaultTitle: response.applyResult?.message ?? '方案应用失败',
      shouldRefreshItinerary: false,
      shouldShowSuccessToast: false,
      isTerminal: true,
      needsRepair: false,
      effectiveDecisionId,
    };
  }

  if (
    executionStatus === 'APPLIED' ||
    executionStatus === 'RESOLVED' ||
    response.problemResolution?.status === 'RESOLVED'
  ) {
    return {
      variant: 'success',
      defaultTitle: '方案已应用到行程',
      shouldRefreshItinerary: true,
      shouldShowSuccessToast: true,
      isTerminal: executionStatus
        ? DECISION_EXECUTION_TERMINAL_STATUSES.has(executionStatus)
        : true,
      needsRepair: false,
      effectiveDecisionId,
    };
  }

  return {
    variant: 'in_progress',
    defaultTitle: '正在应用方案…',
    shouldRefreshItinerary: false,
    shouldShowSuccessToast: false,
    isTerminal: executionStatus
      ? DECISION_EXECUTION_TERMINAL_STATUSES.has(executionStatus)
      : false,
    needsRepair: false,
    effectiveDecisionId,
  };
}

/** Classify GET execution-status poll tick — same UX rules as POST. */
export function classifyExecutionStatusPoll(
  poll: DecisionExecutionStatusResponse,
): ClassifiedDecisionOutcome {
  return classifyCreateDecisionOutcome({
    decision: {
      id: poll.decisionId,
      tripId: poll.tripId,
      problemId: poll.problemId,
      selectedOptionId: poll.selectedOptionId,
      rejectedOptionIds: [],
      decidedBy: [],
      authoritySnapshot: POLL_STUB_AUTHORITY,
      reasons: [],
      decidedAt: poll.decidedAt,
      tripVersionBefore: poll.tripVersionBefore,
      tripVersionAfter: poll.tripVersionAfter,
      status: poll.recordStatus,
      validationStatus: poll.validationStatus,
    },
    executionStatus: poll.status,
    effectiveDecisionId: poll.effectiveDecisionId,
    applyResult: poll.applyResult,
    needsRepair: poll.needsRepair,
    postApplyCoherence: poll.postApplyCoherence,
  });
}

export function shouldPollDecisionExecution(status: DecisionExecutionStatus): boolean {
  return !DECISION_EXECUTION_TERMINAL_STATUSES.has(status);
}

/** L1 — recentDecisions / open counts: PARTIALLY_APPLIED counts as pending, not resolved. */
export function isDecisionPendingAttention(status: DecisionExecutionStatus): boolean {
  return (
    status === 'PARTIALLY_APPLIED' ||
    status === 'APPLYING' ||
    status === 'RECOMPUTING' ||
    status === 'PARTIALLY_RESOLVED'
  );
}

export function isDecisionResolvedForOverview(status: DecisionExecutionStatus): boolean {
  return status === 'RESOLVED' || status === 'APPLIED';
}

/** Stable idempotency key for double-tap / network retry on same problem+option. */
export function buildDecisionIdempotencyKey(input: {
  tripId: string;
  problemId: string;
  selectedOptionId: string;
  clientAttemptId?: string;
}): string {
  const attempt = input.clientAttemptId?.trim() || 'default';
  return `dc:${input.tripId}:${input.problemId}:${input.selectedOptionId}:${attempt}`;
}
