import { computeSelectionDiff } from './draft-diff.engine';
import type { TripDraftSelection } from '../state/trip-draft-state.types';

describe('computeSelectionDiff', () => {
  it('detects added, removed, changed', () => {
    const a: TripDraftSelection[] = [
      { day: 1, slot: 'morning', placeId: 10 },
      { day: 1, slot: 'lunch', placeId: 20 },
    ];
    const b: TripDraftSelection[] = [
      { day: 1, slot: 'morning', placeId: 10 },
      { day: 1, slot: 'lunch', placeId: 99 },
      { day: 1, slot: 'afternoon', placeId: 30 },
    ];
    const d = computeSelectionDiff(a, b);
    expect(d.removed).toEqual([]);
    expect(d.added.map((x) => x.slot)).toEqual(['afternoon']);
    expect(d.changed.length).toBe(1);
    expect(d.changed[0].before.placeId).toBe(20);
    expect(d.changed[0].after.placeId).toBe(99);
  });

  it('detects removed slot', () => {
    const a: TripDraftSelection[] = [{ day: 2, slot: 'dinner', placeId: 5 }];
    const b: TripDraftSelection[] = [];
    const d = computeSelectionDiff(a, b);
    expect(d.removed.length).toBe(1);
    expect(d.added.length).toBe(0);
  });
});
