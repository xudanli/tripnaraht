import { RouteDirectionsService } from './route-directions.service';

describe('RouteDirectionsService template time construction', () => {
  it('builds default route-template slots in the destination timezone, not server timezone', () => {
    const service = new RouteDirectionsService({} as any, {} as any) as any;

    const result = service.calculateSlotTime(new Date('2026-06-22T00:00:00.000Z'), 'morning', 'IS');

    expect(result.startTime.toISOString()).toBe('2026-06-22T09:00:00.000Z');
    expect(result.endTime.toISOString()).toBe('2026-06-22T12:00:00.000Z');
  });

  it('keeps non-UTC destination slots aligned to local time before storing UTC', () => {
    const service = new RouteDirectionsService({} as any, {} as any) as any;

    const result = service.calculateSlotTime(new Date('2026-06-22T00:00:00.000Z'), 'morning', 'JP');

    expect(result.startTime.toISOString()).toBe('2026-06-22T00:00:00.000Z');
    expect(result.endTime.toISOString()).toBe('2026-06-22T03:00:00.000Z');
  });

  it('does not fill route-template days with unrelated POIs from the global candidate pool', () => {
    const service = new RouteDirectionsService({} as any, {} as any) as any;

    const result = service.mockLLMOrchestration(
      {
        dayPlans: [
          { day: 1, theme: 'A', pois: [{ id: 1, nameCN: 'A', durationMinutes: 180 }] },
          { day: 2, theme: 'B', pois: [{ id: 2, nameCN: 'B', durationMinutes: 180 }] },
        ],
      },
      [
        { id: 1, nameCN: 'A', category: 'ATTRACTION' },
        { id: 2, nameCN: 'B', category: 'ATTRACTION' },
        { id: 3, nameCN: 'C', category: 'ATTRACTION' },
      ],
      2,
    );

    expect(result.days[0].slots.morning?.placeId).toBe(1);
    expect(result.days[0].slots.afternoon).toBeNull();
    expect(result.days[1].slots.morning?.placeId).toBe(2);
    expect(result.days[1].slots.afternoon).toBeNull();
  });
});
