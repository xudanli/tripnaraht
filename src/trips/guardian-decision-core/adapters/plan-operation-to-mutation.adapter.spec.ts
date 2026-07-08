import { buildTripMutationSetFromPlanOperations } from './plan-operation-to-mutation.adapter';
import type { PlanOperation } from '../contracts/plan-operation.types';

describe('plan-operation-to-mutation.adapter (WP3)', () => {
  it('MAT-001: REPLACE_ITEM maps to REMOVE + substitute after payload', () => {
    const ops: PlanOperation[] = [
      {
        operationId: 'op_replace',
        kind: 'REPLACE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id: 'item-1' }],
        parameters: {
          itineraryItemId: 'item-1',
          substitutePoiId: 'is.skogafoss',
        },
      },
    ];
    const set = buildTripMutationSetFromPlanOperations({
      tripId: 'trip_1',
      decisionId: 'dec_1',
      versionBefore: '17',
      operations: ops,
    });
    expect(set.sourceDecisionId).toBe('dec_1');
    expect(set.operations[0].operation).toBe('REMOVE');
    expect(set.operations[0].entityId).toBe('item-1');
    expect(set.operations[0].after?.substitutePoiId).toBe('is.skogafoss');
  });

  it('MAT-002: CHANGE_ROUTE maps to JOURNEY_LEG UPDATE', () => {
    const set = buildTripMutationSetFromPlanOperations({
      tripId: 'trip_1',
      decisionId: 'dec_1',
      versionBefore: '17',
      operations: [
        {
          operationId: 'op_route',
          kind: 'CHANGE_ROUTE',
          targetRefs: [{ kind: 'ROUTE_SEGMENT', id: 'seg-1' }],
          parameters: { bypassRoadId: 'RING_ROAD', itineraryItemId: 'item-1' },
        },
      ],
    });
    expect(set.operations[0].entityType).toBe('JOURNEY_LEG');
    expect(set.operations[0].after?.bypassRoadId).toBe('RING_ROAD');
  });
});
