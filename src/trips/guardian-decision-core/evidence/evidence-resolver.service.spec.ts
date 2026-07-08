import { EvidenceResolverService } from './evidence-resolver.service';
import { WorldStateStoreService } from './world-state-store.service';
import { buildRoadStatusChangedEvent } from './road-status-changed.event';
import type { PrismaService } from '../../../prisma/prisma.service';

function createMockPrisma(initialMetadata: Record<string, unknown> = {}) {
  let metadata = { ...initialMetadata };
  return {
    trip: {
      findUnique: jest.fn(async () => ({ metadata })),
      update: jest.fn(async ({ data }: { data: { metadata: unknown } }) => {
        metadata = data.metadata as Record<string, unknown>;
        return { metadata };
      }),
    },
    getMetadata: () => metadata,
  };
}

describe('EvidenceResolverService (PR-A)', () => {
  it('ICE-WS-001: resolveRoadStatusChanged persists assertion with evidenceRef and validUntil', async () => {
    const mock = createMockPrisma();
    const store = new WorldStateStoreService(mock as unknown as PrismaService);
    const resolver = new EvidenceResolverService(store);

    const event = buildRoadStatusChangedEvent({
      tripId: 'trip_iceland_1',
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: 'trip-trip_iceland_1-item-day3',
      sourceProvider: 'admin_injection',
      occurredAt: '2026-06-30T10:22:00.000Z',
    });

    const result = await resolver.resolveRoadStatusChanged(event);

    expect(result.assertion.source.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.assertion.validUntil).toBeDefined();
    expect(result.resolverVersion).toMatch(/evidence-resolver/);
    expect(result.snapshot.assertionIds).toContain(result.assertion.assertionId);
    expect(result.hardClosure).toBe(true);

    const persisted = await store.readStore('trip_iceland_1');
    expect(persisted.assertions.length).toBe(1);
    expect(persisted.events.length).toBe(1);
    expect(persisted.snapshots.length).toBe(1);
  });

  it('supersedes prior ACTIVE assertion for same road', async () => {
    const mock = createMockPrisma();
    const store = new WorldStateStoreService(mock as unknown as PrismaService);
    const resolver = new EvidenceResolverService(store);

    const openEvent = buildRoadStatusChangedEvent({
      tripId: 'trip_iceland_1',
      roadId: 'F208',
      status: 'OPEN',
      sourceProvider: 'road.is_api',
    });
    await resolver.resolveRoadStatusChanged(openEvent);

    const closedEvent = buildRoadStatusChangedEvent({
      tripId: 'trip_iceland_1',
      roadId: 'F208',
      status: 'CLOSED',
      previousStatus: 'OPEN',
      sourceProvider: 'road.is_api',
    });
    const result = await resolver.resolveRoadStatusChanged(closedEvent);

    expect(result.supersededAssertionIds.length).toBe(1);
    const persisted = await store.readStore('trip_iceland_1');
    const active = persisted.assertions.filter((a) => a.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect((active[0].payload as { status: string }).status).toBe('CLOSED');
  });

  it('fetchAndResolveIfChanged returns null when status unchanged', async () => {
    const mock = createMockPrisma();
    const store = new WorldStateStoreService(mock as unknown as PrismaService);
    const roadStatusRealtime = {
      getRoadStatus: jest.fn(async () => ({
        roadId: 'F208',
        currentStatus: 'closed' as const,
        lastVerifiedAt: new Date('2026-06-30T10:22:00.000Z'),
        hazards: [],
        confidence: 0.9,
        dataSource: 'road.is_api',
      })),
    };
    const resolver = new EvidenceResolverService(
      store,
      roadStatusRealtime as any,
    );

    await resolver.fetchAndResolveIfChanged({
      tripId: 'trip_iceland_1',
      roadId: 'F208',
    });
    const second = await resolver.fetchAndResolveIfChanged({
      tripId: 'trip_iceland_1',
      roadId: 'F208',
    });
    expect(second).toBeNull();
  });
});
