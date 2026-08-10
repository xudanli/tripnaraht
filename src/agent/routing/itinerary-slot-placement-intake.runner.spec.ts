import { resolveItinerarySlotCandidatesForIntake } from './itinerary-slot-placement-intake.runner';
import type { ItinerarySlotPlacementIntakeHost } from './itinerary-slot-placement-intake.host';

describe('itinerary-slot-placement-intake.runner', () => {
  it('falls back to heuristic when ContextAnalyzer is absent', async () => {
    const host: ItinerarySlotPlacementIntakeHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      prisma: {} as any,
    };
    const result = await resolveItinerarySlotCandidatesForIntake(
      host,
      '想看极光',
      { destination: '冰岛', request_id: 'r1' } as any,
      'trip-1',
      undefined,
      [],
    );
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.paAnalysis).toBeUndefined();
  });
});
