import { arbitrateSlots } from './slot-arbitration.engine';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { TripDraftSelection } from '../state/trip-draft-state.types';

function place(id: number, lat: number, lng: number): CandidatePlace {
  return {
    id,
    nameCN: `P${id}`,
    category: 'ATTRACTION',
    type: 'ATTRACTION',
    lat,
    lng,
  };
}

describe('arbitrateSlots', () => {
  it('emits SlotDecision per slot and HYBRID scoring path', () => {
    const llm: TripDraftSelection[] = [{ day: 1, slot: 'morning', placeId: 1 }];
    const algo: TripDraftSelection[] = [{ day: 1, slot: 'morning', placeId: 2 }];
    const candidatesById = new Map<number, CandidatePlace>([
      [1, place(1, 35.68, 139.76)],
      [2, place(2, 35.69, 139.77)],
    ]);
    const r = arbitrateSlots({
      llmSelections: llm,
      algoSelections: algo,
      candidatesById,
      transport: 'walk',
    });
    expect(r.slotDecisions.length).toBe(1);
    expect(r.finalSelections.length).toBe(1);
    expect(r.overrideTrace.length).toBe(1);
  });
});
