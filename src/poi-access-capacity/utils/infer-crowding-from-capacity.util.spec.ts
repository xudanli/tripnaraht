import { inferCrowdingFromCapacitySnapshots } from './infer-crowding-from-capacity.util';

describe('inferCrowdingFromCapacitySnapshots', () => {
  it('09:00 售罄 → FULL / 高等待', () => {
    const snap = inferCrowdingFromCapacitySnapshots({
      poiId: 'is.blue_lagoon',
      dateISO: '2026-08-01',
      arrivalTime: '09:30',
      snapshots: [
        {
          poiId: 'is.blue_lagoon',
          dateISO: '2026-08-01',
          slotStartTime: '09:00',
          slotEndTime: '10:00',
          remaining: 0,
          capacity: 50,
          soldOut: true,
          signalSource: 'BOKUN',
          observedAt: '2026-08-01T08:00:00.000Z',
        },
        {
          poiId: 'is.blue_lagoon',
          dateISO: '2026-08-01',
          slotStartTime: '11:00',
          slotEndTime: '12:00',
          remaining: 18,
          capacity: 50,
          soldOut: false,
          signalSource: 'BOKUN',
          observedAt: '2026-08-01T08:00:00.000Z',
        },
      ],
    });
    expect(snap?.crowdLevel).toBe('FULL');
    expect(snap?.predictedWaitP50).toBeGreaterThanOrEqual(40);
    expect(snap?.signalSources).toContain('BOOKING');
  });
});
