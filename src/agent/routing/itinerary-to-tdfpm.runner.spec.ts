import { itineraryToTdfpmDayContexts } from './itinerary-to-tdfpm.runner';

describe('itinerary-to-tdfpm.runner', () => {
  it('sums drive minutes into drivingHours', () => {
    const contexts = itineraryToTdfpmDayContexts({
      days: [
        {
          items: [
            { type: 'DRIVE', metadata: { duration_minutes: 120 }, start_window: '09:00' },
          ],
        },
      ],
    } as any);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].drivingHours).toBe(2);
    expect(contexts[0].departureHour).toBe(9);
  });
});
