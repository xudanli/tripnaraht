import { applySlotArbitrationToOrchestrationResult } from './apply-slot-arbitration-to-draft';
import type { SlotArbitrationResult } from './slot-arbitration.types';

describe('applySlotArbitrationToOrchestrationResult', () => {
  it('merges final placeId and preserves slot payload from winning side', () => {
    const arbitration: SlotArbitrationResult = {
      slotDecisions: [
        {
          day: 1,
          slot: 'morning',
          llmChoice: { day: 1, slot: 'morning', placeId: 1 },
          algoChoice: { day: 1, slot: 'morning', placeId: 2 },
          finalChoice: { day: 1, slot: 'morning', placeId: 2 },
          decisionSource: 'ALGO',
          reason: 'algo wins',
        },
      ],
      finalSelections: [{ day: 1, slot: 'morning', placeId: 2 }],
      overrideTrace: [],
    };
    const r = applySlotArbitrationToOrchestrationResult({
      llmDays: {
        days: [{ day: 1, slots: { morning: { placeId: 1, reason: 'llm' } } }],
      },
      algoDays: {
        days: [{ day: 1, slots: { morning: { placeId: 2, reason: 'algo' } } }],
      },
      arbitration,
    });
    expect(r.days[0].slots.morning).toMatchObject({ placeId: 2, reason: expect.stringContaining('[ALGO]') });
  });
});
