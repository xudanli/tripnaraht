import {
  isInformOnlyContent,
  qualifiesForDecisionQueue,
  qualifiesForPlanningConflicts,
} from './decision-queue-admission.util';
import {
  buildInstanceKey,
  mapCanonicalProblemToRow,
  projectRowToListItem,
} from './unified-decision-problem-projection.util';
import { projectDecisionProblemsToPlanningConflicts } from './planning-conflicts-projection.util';

describe('decision-queue-admission.util', () => {
  it('excludes emergency phone from decision queue', () => {
    expect(
      isInformOnlyContent({
        title: '冰岛紧急电话',
        summary: '冰岛 紧急电话：报警：112',
      }),
    ).toBe(true);
    expect(
      qualifiesForDecisionQueue({
        enforcement: 'REQUIRE_CONFIRMATION',
        workflowStatus: 'WAITING_DECISION',
        title: '冰岛紧急电话',
        summary: '112',
      }),
    ).toBe(false);
  });

  it('includes BLOCK transport problems in planning conflicts', () => {
    expect(
      qualifiesForPlanningConflicts({
        phase: 'PLANNING',
        workflowStatus: 'OPEN',
        affectsPlan: true,
        enforcement: 'BLOCK',
        semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
        title: 'F208 封路',
      }),
    ).toBe(true);
  });
});

describe('unified-decision-problem-projection.util', () => {
  it('projects canonical road closure with required keys', () => {
    const row = mapCanonicalProblemToRow(
      {
        problemId: 'problem_f208',
        problemSummary: {
          id: 'problem_f208',
          tripId: 'trip1',
          type: 'INFEASIBILITY',
          title: 'F208 道路关闭',
          description: '道路已关闭',
          status: 'OPEN',
          detectedBy: 'GUARDIAN',
          detectedAt: '2026-07-03T00:00:00Z',
          tripVersion: '1',
          affectedScope: [{ scopeType: 'ROUTE_SEGMENT', scopeId: 'F208', impactType: 'BLOCKED', severity: 'CRITICAL' }],
          semanticKey: 'ROAD_SEGMENT_UNAVAILABLE:evt1',
          sourceRefs: [],
          assertionIds: [],
        },
        rfc001Problem: {
          problemId: 'problem_f208',
          tripId: 'trip1',
          planVersionId: 'pv1',
          type: 'FEASIBILITY_FAILURE',
          triggerEventId: 'evt1',
          affectedEntityRefs: [],
          affectedPlanItemIds: ['item-1'],
          worldStateSnapshotId: 'ws1',
          detectedAt: '2026-07-03T00:00:00Z',
          urgency: 'CRITICAL',
          status: 'OPEN',
          semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
        },
        leadingPersona: 'DECISION_CORE',
        requiresUserConfirmation: false,
        candidates: [],
        options: [{ id: 'c1', problemId: 'problem_f208', type: 'REPAIR', title: '绕行', description: '', source: 'ALTERNATIVE_GENERATOR', resolves: [], tradeoffs: [], executable: true, requiresConfirmation: true }],
        lineage: [],
      } as never,
      'trip1',
      'ROAD_SEGMENT_UNAVAILABLE:evt1',
    );

    expect(row.semanticKey).toBe('ROAD_SEGMENT_UNAVAILABLE');
    expect(row.enforcement).toBe('BLOCK');
    expect(row.instanceKey).toContain('trip:trip1');
    expect(
      projectDecisionProblemsToPlanningConflicts([row]).some((c) => c.id === 'problem_f208'),
    ).toBe(true);

    const item = projectRowToListItem(row, false);
    expect(item.debug).toBeUndefined();
    expect(item.actionability.allowedActions).toContain('REPAIR');
    expect(item.actionability.allowedActions).not.toContain('ACCEPT_RISK');
  });

  it('builds stable instance keys', () => {
    expect(
      buildInstanceKey({
        semanticKey: 'INSUFFICIENT_TRANSFER_BUFFER',
        tripId: '510d95ce-0000-0000-0000-000000000001',
        problemId: 'dp_buffer_1',
        scope: { tripId: 'trip', dayIds: [2], routeSegmentIds: ['seg-a'] },
      }),
    ).toContain('day:2');
  });
});
