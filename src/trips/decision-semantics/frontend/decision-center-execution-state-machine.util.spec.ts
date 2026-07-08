import {
  buildDecisionIdempotencyKey,
  classifyCreateDecisionOutcome,
  classifyExecutionStatusPoll,
  DECISION_EXECUTION_TERMINAL_STATUSES,
  isDecisionPendingAttention,
  isDecisionResolvedForOverview,
  shouldPollDecisionExecution,
} from './decision-center-execution-state-machine.util';
import type {
  CreateDecisionResponse,
  DecisionExecutionStatus,
} from '../types/decision-semantics.types';

describe('decision-center-execution-state-machine', () => {
  const baseDecision = {
    id: 'dec_1',
    tripId: 'trip_1',
    problemId: 'dp_1',
    selectedOptionId: 'opt_1',
    rejectedOptionIds: [],
    decidedBy: [],
    authoritySnapshot: {
      decisionDomain: 'ROUTE' as const,
      proposer: 'SYSTEM' as const,
      requiredApprover: 'SYSTEM' as const,
      executionMode: 'AUTO' as const,
      overridable: false,
    },
    reasons: [],
    decidedAt: new Date().toISOString(),
    tripVersionBefore: 'v1',
    status: 'EXECUTED' as const,
    validationStatus: 'PENDING' as const,
  };

  it('terminal set includes Release Gate statuses', () => {
    expect(DECISION_EXECUTION_TERMINAL_STATUSES.has('IDEMPOTENT_REPLAY')).toBe(true);
    expect(DECISION_EXECUTION_TERMINAL_STATUSES.has('PARTIALLY_APPLIED')).toBe(true);
    expect(DECISION_EXECUTION_TERMINAL_STATUSES.has('ROLLED_BACK')).toBe(true);
    expect(DECISION_EXECUTION_TERMINAL_STATUSES.has('APPLYING')).toBe(false);
  });

  it('classifies idempotent replay — no refresh, no success toast', () => {
    const r = classifyCreateDecisionOutcome({
      decision: baseDecision,
      executionStatus: 'IDEMPOTENT_REPLAY',
      idempotentReplay: true,
      effectiveDecisionId: 'dec_effective',
    });
    expect(r.variant).toBe('neutral_replay');
    expect(r.shouldRefreshItinerary).toBe(false);
    expect(r.shouldShowSuccessToast).toBe(false);
    expect(r.effectiveDecisionId).toBe('dec_effective');
  });

  it('classifies partially applied — needs repair, no success toast', () => {
    const r = classifyCreateDecisionOutcome({
      decision: { ...baseDecision, status: 'PARTIALLY_APPLIED' },
      executionStatus: 'PARTIALLY_APPLIED',
      needsRepair: true,
      postApplyCoherence: {
        outcome: 'PARTIALLY_APPLIED',
        phase: 'route_recalc',
        failureMessage: '路线重算失败',
        needsRepair: true,
      },
    });
    expect(r.variant).toBe('warning_needs_repair');
    expect(r.shouldShowSuccessToast).toBe(false);
    expect(r.needsRepair).toBe(true);
    expect(r.shouldRefreshItinerary).toBe(true);
  });

  it('classifies stale evidence block — no itinerary refresh', () => {
    const r = classifyCreateDecisionOutcome({
      decision: { ...baseDecision, status: 'APPROVED' },
      executionStatus: 'RECORDED',
      evidenceFreshnessBlock: {
        blocked: true,
        reasonCode: 'DATA_STALE',
        staleEvidenceTypes: ['road_closure'],
        requiresEvidenceRefresh: true,
      },
    });
    expect(r.variant).toBe('blocked_stale_evidence');
    expect(r.shouldRefreshItinerary).toBe(false);
  });

  it('L1 pending attention includes PARTIALLY_APPLIED only', () => {
    expect(isDecisionPendingAttention('PARTIALLY_APPLIED')).toBe(true);
    expect(isDecisionResolvedForOverview('PARTIALLY_APPLIED')).toBe(false);
    expect(isDecisionResolvedForOverview('RESOLVED')).toBe(true);
  });

  it('shouldPoll stops at terminal statuses', () => {
    expect(shouldPollDecisionExecution('APPLYING')).toBe(true);
    expect(shouldPollDecisionExecution('ROLLED_BACK')).toBe(false);
  });

  it('buildDecisionIdempotencyKey is stable per problem+option', () => {
    const a = buildDecisionIdempotencyKey({
      tripId: 't1',
      problemId: 'p1',
      selectedOptionId: 'o1',
    });
    const b = buildDecisionIdempotencyKey({
      tripId: 't1',
      problemId: 'p1',
      selectedOptionId: 'o1',
    });
    expect(a).toBe(b);
  });

  it('classifyExecutionStatusPoll mirrors POST rules', () => {
    const poll = classifyExecutionStatusPoll({
      decisionId: 'dec_1',
      tripId: 'trip_1',
      problemId: 'dp_1',
      selectedOptionId: 'opt_1',
      status: 'IDEMPOTENT_REPLAY' as DecisionExecutionStatus,
      recordStatus: 'EXECUTED',
      validationStatus: 'NOT_APPLICABLE',
      decidedAt: new Date().toISOString(),
      tripVersionBefore: 'v1',
      explanation: '重复提交',
      generatedAt: new Date().toISOString(),
      effectiveDecisionId: 'dec_eff',
    });
    expect(poll.variant).toBe('neutral_replay');
    expect(poll.shouldRefreshItinerary).toBe(false);
  });
});
