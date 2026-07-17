import {
  findProblemByRef,
  resolveFocusedProblem,
} from './decision-space-page-context.builder';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { ClientPageState } from '../contracts/page-insight.types';

function item(
  problemId: string,
  instanceKey: string,
  workflowStatus: UnifiedDecisionProblemListItem['workflowStatus'] = 'WAITING_DECISION',
): UnifiedDecisionProblemListItem {
  return {
    problemId,
    semanticKey: 'same_day_travel:day1',
    instanceKey,
    type: 'INFEASIBILITY',
    dimension: 'SCHEDULE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus,
    executionStatus: 'NOT_REQUIRED',
    title: '同日交通偏紧',
    summary: 'test',
    scope: { tripId: 't1' },
    evidenceSummary: { count: 1, freshness: 'FRESH' },
    actionability: {
      requiresAction: true,
      allowedActions: ['REPAIR'],
      writeChain: 'EVALUATE_AUTHORIZE_EXECUTE',
    },
    occurrenceCount: 1,
    detectors: [],
    origin: { authority: 'LEGACY', primaryDetector: 'feasibility' },
  };
}

describe('resolveFocusedProblem · dp_travel / instanceKey', () => {
  const travelId =
    'dp_travel:same_day_travel:413cf4ea-aaaa-bbbb-cccc-ddddeeeeffff:56a20f59-1111-2222-3333-444455556666';
  const instanceKey =
    'same_day_travel:trip:413cf4ea:day:4:problem:dp_travel:same_day_travel:413cf4ea-aaaa-bbbb-cccc-ddddeeeeffff:56a20f59-1111-2222-3333-444455556666';

  const open = [item(travelId, instanceKey)];

  it('matches problemId', () => {
    const client: ClientPageState = {
      pageId: 'DECISION_SPACE',
      lifecycle: 'PLANNING',
      selectedRefs: [{ entityType: 'DECISION_PROBLEM', entityId: travelId }],
    };
    const r = resolveFocusedProblem(client, open, open);
    expect(r.diag.resolveStatus).toBe('MATCHED_PROBLEM_ID');
    expect(r.problem?.problemId).toBe(travelId);
  });

  it('matches instanceKey when FE sends list row id', () => {
    const client: ClientPageState = {
      pageId: 'DECISION_SPACE',
      lifecycle: 'PLANNING',
      selectedRefs: [{ entityType: 'DECISION_PROBLEM', entityId: instanceKey }],
    };
    expect(findProblemByRef(open, instanceKey)?.via).toBe('instanceKey');
    const r = resolveFocusedProblem(client, open, open);
    expect(r.diag.resolveStatus).toBe('MATCHED_INSTANCE_KEY');
    expect(r.problem?.problemId).toBe(travelId);
    expect(r.diag.matchedVia).toBe('instanceKey');
  });

  it('does not silently fallback when selected id missing from open queue', () => {
    const client: ClientPageState = {
      pageId: 'DECISION_SPACE',
      lifecycle: 'PLANNING',
      selectedRefs: [
        {
          entityType: 'DECISION_PROBLEM',
          entityId: 'dp_travel:same_day_travel:other:other',
        },
      ],
    };
    const otherOpen = [item('dc_glacier_x', 'dc_glacier_x')];
    const r = resolveFocusedProblem(client, otherOpen, otherOpen);
    expect(r.problem).toBeUndefined();
    expect(r.diag.resolveStatus).toBe('SELECTED_NOT_IN_QUEUE');
    expect(r.diag.openProblemIds).toEqual(['dc_glacier_x']);
  });

  it('marks SELECTED_TERMINAL when in queue but RESOLVED', () => {
    const resolved = [item(travelId, instanceKey, 'RESOLVED')];
    const client: ClientPageState = {
      pageId: 'DECISION_SPACE',
      lifecycle: 'PLANNING',
      selectedRefs: [{ entityType: 'DECISION_PROBLEM', entityId: travelId }],
    };
    const r = resolveFocusedProblem(client, [], resolved);
    expect(r.problem).toBeUndefined();
    expect(r.diag.resolveStatus).toBe('SELECTED_TERMINAL');
    expect(r.diag.selectedWorkflowStatus).toBe('RESOLVED');
  });
});
