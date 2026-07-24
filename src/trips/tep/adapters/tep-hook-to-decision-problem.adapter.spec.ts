import {
  projectHookToDecisionProblemDraft,
  shouldTriggerHookTransition,
} from '../adapters/tep-hook-to-decision-problem.adapter';
import type { DecisionHook } from '../contracts/tep-self-drive.types';

const roadHook: DecisionHook = {
  hookId: 'HOOK-ROAD-D1-1',
  targetRef: 'drive_leg_1_1',
  triggerType: 'ROAD_STATUS_CHANGE',
  sourceMetric: 'road.status',
  triggerCondition: {
    metric: 'road.status',
    operator: 'IN',
    value: ['CLOSED', 'LIMITED', 'RESTRICTED'],
  },
  leadTime: 'PT24H',
  impactScope: ['drive_leg_1_1', 'activity_item_b', 'segment:cert:F208'],
  defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
  semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
};

describe('tep-hook-to-decision-problem.adapter', () => {
  it('projects RESOURCE_UNAVAILABLE problem from road hook (IS-CERT-301)', () => {
    const problem = projectHookToDecisionProblemDraft({
      tripId: 'cert_301',
      planVersionId: 'plan_v1',
      hook: roadHook,
      triggerEventId: 'evt_1',
      worldStateSnapshotId: 'ws_1',
    });

    expect(problem).toMatchObject({
      type: 'RESOURCE_UNAVAILABLE',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      status: 'OPEN',
      urgency: 'HIGH',
    });
    expect(problem.affectedPlanItemIds).toContain('activity_item_b');
    expect(problem.affectedEntityRefs.some((e) => e.id === 'segment:cert:F208')).toBe(
      true,
    );
  });

  it('detects OPEN→CLOSED transition', () => {
    const triggered = shouldTriggerHookTransition({
      hook: roadHook,
      previousObservation: { 'road.status': 'OPEN' },
      currentObservation: { 'road.status': 'CLOSED' },
    });
    expect(triggered).toBe(true);
  });

  it('does not re-trigger when already CLOSED', () => {
    const triggered = shouldTriggerHookTransition({
      hook: roadHook,
      previousObservation: { 'road.status': 'CLOSED' },
      currentObservation: { 'road.status': 'CLOSED' },
    });
    expect(triggered).toBe(false);
  });
});
