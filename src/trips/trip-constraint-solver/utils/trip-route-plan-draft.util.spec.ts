import { synthesizeRoutePlanDraftFromTrip } from './trip-route-plan-draft.util';

describe('synthesizeRoutePlanDraftFromTrip', () => {
  it('builds segments from trip days and items', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-1',
          destination: 'IS',
          TripDay: [
            {
              id: 'day-1',
              date: new Date('2026-07-01'),
              ItineraryItem: [{ id: 'item-1' }, { id: 'item-2' }],
            },
            {
              id: 'day-2',
              date: new Date('2026-07-02'),
              ItineraryItem: [],
            },
          ],
        }),
      },
    } as any;

    const draft = await synthesizeRoutePlanDraftFromTrip(prisma, 'trip-1');
    expect(draft?.tripId).toBe('trip-1');
    expect(draft?.segments).toHaveLength(3);
    expect(draft?.segments[2].metadata?.tripDayId).toBe('day-2');
  });

  it('uses travelFromPreviousDistance when trail is absent', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-2',
          destination: 'IS',
          TripDay: [
            {
              id: 'day-1',
              date: new Date('2026-07-01'),
              ItineraryItem: [
                {
                  id: 'item-1',
                  travelFromPreviousDistance: 12500,
                  travelFromPreviousDuration: 18,
                  trailId: null,
                  Trail: null,
                },
              ],
            },
          ],
        }),
      },
    } as any;

    const draft = await synthesizeRoutePlanDraftFromTrip(prisma, 'trip-2');
    expect(draft?.segments[0].distanceKm).toBe(12.5);
    expect(draft?.segments[0].metadata?.distanceSource).toBe('travelFromPrevious');
  });

  it('prefers Trail distance and elevation over travel distance', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-3',
          destination: 'IS',
          TripDay: [
            {
              id: 'day-1',
              date: new Date('2026-07-01'),
              ItineraryItem: [
                {
                  id: 'item-1',
                  travelFromPreviousDistance: 5000,
                  travelFromPreviousDuration: 10,
                  trailId: 1,
                  Trail: {
                    distanceKm: 8.2,
                    elevationGainM: 420,
                    averageSlope: 5.1,
                  },
                },
              ],
            },
          ],
        }),
      },
    } as any;

    const draft = await synthesizeRoutePlanDraftFromTrip(prisma, 'trip-3');
    expect(draft?.segments[0].distanceKm).toBe(8.2);
    expect(draft?.segments[0].ascentM).toBe(420);
    expect(draft?.segments[0].metadata?.distanceSource).toBe('trail');
  });
});
