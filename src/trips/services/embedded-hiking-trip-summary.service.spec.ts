import { suggestHikingPhase } from '../utils/embedded-hiking-trip-metadata.util';

describe('suggestHikingPhase', () => {
  it('returns configure_segments when embedded has no segments', () => {
    expect(
      suggestHikingPhase({
        hikingProfile: 'embedded',
        segments: [],
        hikePlans: [],
      }),
    ).toBe('configure_segments');
  });

  it('returns on_trail when any plan is in_progress', () => {
    expect(
      suggestHikingPhase({
        hikingProfile: 'embedded',
        segments: [
          {
            segmentId: 'a',
            startDate: '2026-03-10',
            endDate: '2026-03-11',
            routeDirectionId: 1,
            hikePlanId: 'p1',
          },
        ],
        hikePlans: [{ id: 'p1', status: 'in_progress', tripId: 't1' }],
      }),
    ).toBe('on_trail');
  });

  it('returns link_plans when segment lacks hikePlanId', () => {
    expect(
      suggestHikingPhase({
        hikingProfile: 'embedded',
        segments: [
          {
            segmentId: 'a',
            startDate: '2026-03-10',
            endDate: '2026-03-11',
            routeDirectionId: 1,
          },
        ],
        hikePlans: [],
      }),
    ).toBe('link_plans');
  });
});
