import type { DayScheduleResult } from '../interfaces/scheduler.interface';
import { expandWhatIfTransforms } from '../services/what-if-transformers';

describe('what-if-transformers', () => {
  const base: DayScheduleResult = {
    stops: [
      { kind: 'POI', id: 'a', startMin: 540, endMin: 600 },
      { kind: 'POI', id: 'b', startMin: 660, endMin: 720 },
      { kind: 'POI', id: 'c', startMin: 780, endMin: 840 },
    ],
  } as DayScheduleResult;

  it('expands SHIFT, SWAP, REMOVE, BUFFER suggestions', () => {
    const out = expandWhatIfTransforms(base, [
      { type: 'SHIFT_EARLIER', poiId: 'b', minutes: 30, reason: 'tight' },
      { type: 'REORDER_AVOID_WAIT', poiId: 'b', reason: 'wait' },
      { type: 'REMOVE_OPTIONAL', poiId: 'a', reason: 'drop' },
      { type: 'ADD_BUFFER', poiId: 'c', minutes: 20, reason: 'buffer' },
    ]);

    expect(out.some((t) => t.action.type === 'SHIFT_EARLIER')).toBe(true);
    expect(out.filter((t) => t.action.type === 'SWAP_NEIGHBOR')).toHaveLength(2);
    expect(out.some((t) => t.action.type === 'REMOVE_ITEM')).toBe(true);
    expect(out.some((t) => t.action.type === 'ADD_BUFFER')).toBe(true);
  });
});
