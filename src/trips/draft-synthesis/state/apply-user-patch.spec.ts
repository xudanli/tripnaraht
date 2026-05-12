import { applyUserPatchToTripDraftState } from './apply-user-patch';
import type { TripDraftState } from './trip-draft-state.types';

function base(): TripDraftState {
  return {
    tripId: 't',
    intent: {
      rawInput: '',
      destination: 'JP',
      cities: [],
      mustHavePois: [],
    },
    calendar: [],
    selections: [{ day: 1, slot: 'morning', placeId: 10 }],
    constraintLog: { mealUsed: {}, placeRepeatCount: {} },
    topology: { zoneTransitions: [] },
    uncertainty: { items: [] },
    mode: 'LLM',
    version: 3,
  };
}

describe('applyUserPatchToTripDraftState', () => {
  it('bumps version and replaces place', () => {
    const n = applyUserPatchToTripDraftState(base(), {
      type: 'replace_place',
      day: 1,
      slot: 'morning',
      newPlaceId: 99,
    });
    expect(n.version).toBe(4);
    expect(n.selections[0].placeId).toBe(99);
  });

  it('locks place id on intent', () => {
    const n = applyUserPatchToTripDraftState(base(), {
      type: 'lock_place',
      targetPlaceId: 10,
    });
    expect(n.intent.lockedPlaceIds).toContain(10);
  });
});
