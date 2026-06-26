import { TripDependencyImpactService } from './trip-dependency-impact.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TripDependencyImpactService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  const service = new TripDependencyImpactService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyzes cascade for trip with flight item', async () => {
    (prisma.trip.findUnique as jest.Mock).mockResolvedValue({
      id: 'trip-1',
      TripDay: [
        {
          date: new Date('2026-06-15'),
          ItineraryItem: [
            {
              id: 'fi',
              type: 'TRANSIT',
              startTime: new Date('2026-06-15T06:00:00Z'),
              endTime: new Date('2026-06-15T14:00:00Z'),
              note: 'FI123',
              metadata: { flight: 'FI123' },
              Place: { nameCN: 'KEF', metadata: { flight: 'FI123' } },
            },
            {
              id: 'tr',
              type: 'TRANSIT',
              startTime: new Date('2026-06-15T14:45:00Z'),
              Place: { nameCN: 'Shuttle', metadata: { duration_minutes: 50 } },
            },
          ],
        },
      ],
    });

    const result = await service.analyzeForTrip('trip-1', {
      flightEvidence: {
        factType: 'FLIGHT_STATUS',
        entityRef: { kind: 'AIRPORT', id: 'kef' },
        value: { status: 'DELAYED', delayMinutes: 75, scheduledArrival: '2026-06-15T14:00:00.000Z' },
        source: 'test',
        observedAt: new Date().toISOString(),
        confidence: 0.9,
      },
    });

    expect(result.tripId).toBe('trip-1');
    expect(result.impact.affected.length).toBeGreaterThan(0);
    expect(result.coverage.summary).toMatch(/未检查/);
  });

  it('throws when trip missing', async () => {
    (prisma.trip.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.analyzeForTrip('missing', {
        flightEvidence: {
          factType: 'FLIGHT_STATUS',
          entityRef: { kind: 'AIRPORT', id: 'x' },
          value: { status: 'DELAYED', delayMinutes: 10 },
          source: 'test',
          observedAt: new Date().toISOString(),
          confidence: 0.5,
        },
      }),
    ).rejects.toThrow('不存在');
  });
});
