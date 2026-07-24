import { MonitoringAutoTriggerService } from './monitoring-auto-trigger.service';
import { TripMonitoringMvpService } from './trip-monitoring-mvp.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('MonitoringAutoTriggerService', () => {
  it('scans trips affected by road closure changes', async () => {
    const prisma = {
      trip: {
        findMany: jest.fn(async () => [
          {
            id: 'trip_a',
            metadata: {
              rfc001IcelandRoadBindings: { byItemId: { item1: ['F208'] } },
            },
          },
        ]),
      },
    } as unknown as PrismaService;

    const monitoring = {
      scanTrip: jest.fn(async (tripId: string) => ({
        tripId,
        activeAlertCount: 1,
        items: [],
        dispatches: [],
      })),
    } as unknown as TripMonitoringMvpService;

    const service = new MonitoringAutoTriggerService(prisma, monitoring);
    const result = await service.scanForChanges([
      { type: 'ROAD_STATUS_CHANGE', roadId: 'F208', newStatus: 'CLOSED', impact: '' } as never,
    ]);

    expect(result.affectedTripIds).toEqual(['trip_a']);
    expect(monitoring.scanTrip).toHaveBeenCalledWith('trip_a', { dayIndex: undefined });
    expect(result.results).toHaveLength(1);
  });
});
