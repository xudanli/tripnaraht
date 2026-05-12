import {
  executionFailureToWorldBusEvent,
  executionSuccessToWorldBusEvent,
} from './execution-feedback-fold.engine';
import type { ExecutionAction } from './execution-action.types';
import type { ExecutionFeedback } from './execution-feedback.types';

describe('execution-feedback-fold.engine', () => {
  const fbBase = (outcome: ExecutionFeedback['outcome']): ExecutionFeedback => ({
    actionId: 'a1',
    outcome,
    timestamp: 1000,
  });

  describe('executionSuccessToWorldBusEvent', () => {
    it('maps BOOK_POI success to CROWD with delta for twin/global reducers', () => {
      const action: ExecutionAction = {
        id: 'x',
        type: 'BOOK_POI',
        targetId: 42,
        status: 'SUCCESS',
        meta: { placeId: 42, tripId: 't1', cityKey: 'JP' },
      };
      const ev = executionSuccessToWorldBusEvent(action, fbBase('SUCCESS'));
      expect(ev.kind).toBe('CROWD');
      expect(ev.subType).toBe('ACTION_CONFIRMED');
      expect(ev.placeId).toBe(42);
      expect(ev.cityKey).toBe('JP');
      expect(ev.payload.delta).toBe(0.07);
    });

    it('maps NAVIGATE success to TRANSPORT with edgeKey', () => {
      const action: ExecutionAction = {
        id: 'n',
        type: 'NAVIGATE',
        targetId: '1->2',
        status: 'SUCCESS',
        meta: { tripId: 't1', fromPlaceId: 1, placeId: 2, cityKey: 'IS' },
      };
      const ev = executionSuccessToWorldBusEvent(action, fbBase('SUCCESS'));
      expect(ev.kind).toBe('TRANSPORT');
      expect(ev.payload.edgeKey).toBe('1|2');
    });
  });

  describe('executionFailureToWorldBusEvent', () => {
    it('threads cityKey on failures', () => {
      const action: ExecutionAction = {
        id: 'x',
        type: 'BOOK_POI',
        targetId: 9,
        status: 'FAILED',
        meta: { placeId: 9, cityKey: 'JP' },
      };
      const ev = executionFailureToWorldBusEvent(
        { ...fbBase('FAILED'), detail: 'x' },
        action,
      );
      expect(ev?.cityKey).toBe('JP');
      expect(ev?.kind).toBe('CROWD');
    });
  });
});
