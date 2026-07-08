import { EvidenceResolverService } from './evidence-resolver.service';
import { WorldStateStoreService } from './world-state-store.service';
import type { WeatherLiveEvidenceService } from './weather-live-evidence.service';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('EvidenceResolverService.fetchAndResolveWeatherIfChanged', () => {
  it('WX-EV-001: emits event when wind changes', async () => {
    const stores = new Map<string, Record<string, unknown>>([
      ['trip_wx', { metadata: {}, destination: 'IS' }],
    ]);
    const mockPrisma = {
      trip: {
        findUnique: jest.fn(async (args: { where: { id: string } }) => {
          const row = stores.get(args.where.id);
          if (!row) return null;
          return {
            id: args.where.id,
            metadata: row.metadata,
            destination: row.destination ?? 'IS',
          };
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata: unknown } }) => {
          const prev = stores.get(where.id) ?? {};
          stores.set(where.id, { ...prev, metadata: data.metadata });
          return { metadata: data.metadata };
        }),
      },
    } as unknown as PrismaService;

    const worldStore = new WorldStateStoreService(mockPrisma);
    const weatherLive = {
      fetchWindForTripDay: jest.fn(async () => ({
        dayIndex: 2,
        regionId: 'IS_DEFAULT',
        lat: 64.1,
        lng: -21.9,
        windSpeedKmh: 95,
        sourceProvider: 'iceland_met' as const,
      })),
    } as unknown as WeatherLiveEvidenceService;

    const resolver = new EvidenceResolverService(worldStore, undefined, weatherLive);
    const result = await resolver.fetchAndResolveWeatherIfChanged({
      tripId: 'trip_wx',
      dayIndex: 2,
    });

    expect(result?.assertion.payload.windSpeedKmh).toBe(95);
    expect(result?.weatherProhibition).toBe(true);

    const unchanged = await resolver.fetchAndResolveWeatherIfChanged({
      tripId: 'trip_wx',
      dayIndex: 2,
    });
    expect(unchanged).toBeNull();
  });
});
