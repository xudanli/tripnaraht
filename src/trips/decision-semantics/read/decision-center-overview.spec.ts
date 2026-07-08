import { buildDecisionCenterHeadline, buildDecisionCenterOverview } from '../read/decision-center-overview.util';
import { resolveDecisionExecutionStatus } from '../execution/decision-execution-status.util';
import type { DecisionProblemSummary, DecisionRecord } from '../types/decision-semantics.types';

describe('decision-center overview', () => {
  it('builds headline from highest enforcement', () => {
    expect(
      buildDecisionCenterHeadline({ BLOCK: 2, WARN: 1 }, 3),
    ).toBe('有必须处理的旅行阻塞（2 项）');
    expect(buildDecisionCenterHeadline({}, 0)).toBe('当前没有待处理的旅行问题');
  });

  it('aggregates overview counts and affected scope', () => {
    const items: DecisionProblemSummary[] = [
      {
        id: 'dp1',
        type: 'INFEASIBILITY',
        title: 'A',
        status: 'OPEN',
        detectedBy: 'FEASIBILITY',
        primaryEnforcement: 'BLOCK',
        affectedDayNumbers: [2],
      },
      {
        id: 'dp2',
        type: 'RISK',
        title: 'B',
        status: 'WAITING_DECISION',
        detectedBy: 'GATE',
        primaryEnforcement: 'REQUIRE_CONFIRMATION',
        affectedDayNumbers: [3],
      },
    ];

    const overview = buildDecisionCenterOverview({
      tripId: 'trip1',
      tripVersion: 'v1',
      items,
      details: [],
      actionableProblemIds: new Set(['dp1']),
      feasibility: { canStartExecute: false, mustHandleCount: 1 },
    });

    expect(overview.problemCounts.open).toBe(2);
    expect(overview.problemCounts.byEnforcement.BLOCK).toBe(1);
    expect(overview.affectedDayNumbers).toEqual([2, 3]);
    expect(overview.actionableProblemCount).toBe(1);
    expect(overview.feasibility?.canStartExecute).toBe(false);
  });

  it('recentDecisions expose executionStatus and needsRepair (DC-FE-007)', () => {
    const recentRecords: DecisionRecord[] = [
      {
        id: 'dec_partial',
        tripId: 'trip1',
        problemId: 'dp1',
        selectedOptionId: 'opt1',
        rejectedOptionIds: [],
        decidedBy: [{ role: 'TRIP_OWNER' }],
        authoritySnapshot: {
          decisionDomain: 'ROUTE',
          proposer: 'SYSTEM',
          requiredApprover: 'TRIP_OWNER',
          executionMode: 'EXPLICIT_CONFIRMATION',
          overridable: true,
        },
        reasons: [],
        decidedAt: '2026-06-30T10:00:00Z',
        tripVersionBefore: '1',
        tripVersionAfter: '2',
        status: 'PARTIALLY_APPLIED',
        validationStatus: 'PENDING',
        needsRepair: true,
        postApplyCoherence: {
          outcome: 'PARTIALLY_APPLIED',
          needsRepair: true,
        },
      },
    ];

    const overview = buildDecisionCenterOverview({
      tripId: 'trip1',
      tripVersion: 'v2',
      items: [],
      details: [],
      recentRecords,
    });

    expect(overview.recentDecisions).toHaveLength(1);
    expect(overview.recentDecisions[0].executionStatus).toBe('PARTIALLY_APPLIED');
    expect(overview.recentDecisions[0].recordStatus).toBe('PARTIALLY_APPLIED');
    expect(overview.recentDecisions[0].needsRepair).toBe(true);
  });
});

describe('decision execution status', () => {
  const base: DecisionRecord = {
    id: 'dec1',
    tripId: 'trip1',
    problemId: 'dp1',
    selectedOptionId: 'opt1',
    rejectedOptionIds: [],
    decidedBy: [{ role: 'TRIP_OWNER' }],
    authoritySnapshot: {
      decisionDomain: 'ROUTE',
      proposer: 'SYSTEM',
      requiredApprover: 'TRIP_OWNER',
      executionMode: 'EXPLICIT_CONFIRMATION',
      overridable: true,
    },
    reasons: [],
    decidedAt: '2026-06-30T10:00:00Z',
    tripVersionBefore: '1',
    status: 'EXECUTED',
    validationStatus: 'PENDING',
  };

  it('maps EXECUTED to APPLIED', () => {
    expect(
      resolveDecisionExecutionStatus({
        record: { ...base, tripVersionAfter: '2' },
      }),
    ).toBe('APPLIED');
  });

  it('maps validated EXECUTED to RESOLVED', () => {
    expect(
      resolveDecisionExecutionStatus({
        record: { ...base, validationStatus: 'CONFIRMED', tripVersionAfter: '2' },
      }),
    ).toBe('RESOLVED');
  });

  it('maps PROPOSED to RECORDED', () => {
    expect(
      resolveDecisionExecutionStatus({
        record: { ...base, status: 'PROPOSED' },
      }),
    ).toBe('RECORDED');
  });
});
