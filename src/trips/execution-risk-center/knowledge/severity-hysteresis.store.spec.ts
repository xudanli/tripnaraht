import { SeverityHysteresisStoreService } from './severity-hysteresis.store';

describe('SeverityHysteresisStoreService', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.trip.findUnique.mockResolvedValue({ metadata: {} });
    prisma.trip.update.mockResolvedValue({});
  });

  it('persists hysteresis entry to trip.metadata', async () => {
    const store = new SeverityHysteresisStoreService(prisma as never);
    await store.setEntry('trip-1', 'rk-wind', {
      level: 'HIGH',
      executionGate: 'REPLAN_REQUIRED',
      confirmedImprovementReadings: 1,
      updatedAt: '2026-07-09T00:00:00.000Z',
    });

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          metadata: expect.anything(),
        }),
      }),
    );

    const entry = await store.getEntry('trip-1', 'rk-wind');
    expect(entry?.level).toBe('HIGH');
    expect(entry?.confirmedImprovementReadings).toBe(1);
  });

  it('deletes hysteresis entry', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      metadata: {
        executionRiskSeverityHysteresis: {
          byRiskKey: {
            'rk-wind': {
              level: 'HIGH',
              executionGate: 'REPLAN_REQUIRED',
              confirmedImprovementReadings: 0,
              updatedAt: '2026-07-09T00:00:00.000Z',
            },
          },
        },
      },
    });

    const store = new SeverityHysteresisStoreService(prisma as never);
    store.clearCacheForTests('trip-1');
    await store.deleteEntry('trip-1', 'rk-wind');
    expect(await store.getEntry('trip-1', 'rk-wind')).toBeUndefined();
  });
});
