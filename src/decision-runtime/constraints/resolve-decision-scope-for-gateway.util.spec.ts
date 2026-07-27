import { resolveDecisionScopeForGateway } from './resolve-decision-scope-for-gateway.util';
import { DECISION_SCOPE_VIOLATION } from '../verification/evaluate-decision-scope.util';
import { evaluateDecisionScopeBoundRun } from '../verification/evaluate-decision-scope.util';

describe('resolveDecisionScopeForGateway', () => {
  it('auto-builds weather-outdoor-storm DecisionScope from signals', () => {
    const bound = resolveDecisionScopeForGateway({
      tripId: 'trip_is',
      signals: {
        weatherProhibitsOutdoor: true,
        affectedPlanItemIds: ['item_glacier'],
        worldStateSnapshotId: 'wss_storm_1',
      },
    });
    expect(bound.worldStateSnapshotId).toBe('wss_storm_1');
    expect(bound.decisionScope?.trigger).toBe('WEATHER_OUTDOOR_STORM');
    expect(bound.decisionScope?.snapshotId).toBe('wss_storm_1');
    expect(bound.decisionScope?.mutableObjects.map((o) => o.id)).toContain(
      'item_glacier',
    );
  });

  it('prefers explicit decisionScope on signals', () => {
    const bound = resolveDecisionScopeForGateway({
      tripId: 'trip_is',
      signals: {
        weatherProhibitsOutdoor: true,
        decisionScope: {
          schema: 'tripnara.decision_scope@v1',
          snapshotId: 'ws_explicit',
          tripId: 'trip_is',
          trigger: 'CUSTOM',
          affectedObjects: [],
          affectedDays: [0],
          decisionWindow: { from: 'a', to: 'b' },
          mutableObjects: [{ kind: 'PLAN_ITEM', id: 'x' }],
          lockedObjects: [],
          allowedActions: ['REPLACE_ITEM'],
          forbiddenActions: [],
          hardConstraints: [],
          softObjectives: [],
        },
      },
    });
    expect(bound.decisionScope?.trigger).toBe('CUSTOM');
    expect(bound.worldStateSnapshotId).toBe('ws_explicit');
  });

  it('does not invent scope for non-weather scenarios', () => {
    const bound = resolveDecisionScopeForGateway({
      tripId: 'trip_is',
      signals: { excessiveDailyLoad: true },
    });
    expect(bound.decisionScope).toBeUndefined();
  });

  it('scope mutation candidate can fail bound-run verification', () => {
    const bound = resolveDecisionScopeForGateway({
      tripId: 'trip_is',
      signals: {
        stormBlocksOutdoor: 'ACTIVITY_PROHIBITED',
        affectedPlanItemIds: ['item_a'],
        scopeMutationCandidate: {
          actionType: 'MOVE_ITEM',
          targetObjectIds: ['item_a'],
        },
      },
    });
    const check = evaluateDecisionScopeBoundRun({
      tripId: 'trip_is',
      scope: bound.decisionScope!,
      candidate: bound.scopeMutationCandidate,
    });
    expect(check.ok).toBe(false);
    expect(check.assertions[0]?.reasonCode).toBe(DECISION_SCOPE_VIOLATION);
  });
});
