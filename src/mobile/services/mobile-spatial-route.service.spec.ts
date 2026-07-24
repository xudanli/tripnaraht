import { ConflictException } from '@nestjs/common';
import { MobileSpatialRouteService } from './mobile-spatial-route.service';

function makeSpatialService() {
  const tripRow = {
    id: 'trip-1',
    name: '冰岛环岛旅行',
    destination: 'IS',
    metadata: { dayThemes: { 1: '南岸' }, spatialPlanVersion: 2 },
    updatedAt: new Date('2026-07-15T12:00:00.000Z'),
    TripDay: [
      {
        id: 'day-1',
        date: new Date('2026-08-01'),
        ItineraryItem: [
          {
            id: 'item-1',
            placeId: 1,
            type: 'ATTRACTION',
            order: 1,
            startTime: null,
            Place: {
              id: 1,
              nameCN: '塞里雅兰',
              nameEN: 'Seljalandsfoss',
              category: 'waterfall',
              metadata: { lat: 63.6156, lng: -19.9885 },
            },
          },
          {
            id: 'item-2',
            placeId: 2,
            type: 'ATTRACTION',
            order: 2,
            startTime: null,
            Place: {
              id: 2,
              nameCN: '斯科加',
              nameEN: 'Skogafoss',
              category: 'waterfall',
              metadata: { lat: 63.5321, lng: -19.5112 },
            },
          },
        ],
      },
    ],
  };

  const access = {
    assertTripMember: jest.fn(async () => tripRow),
  };
  const prisma = {
    trip: {
      findUnique: jest.fn(async () => tripRow),
      update: jest.fn(async ({ data }: { data: { metadata?: object; updatedAt?: Date } }) => {
        if (data.metadata) Object.assign(tripRow.metadata, data.metadata);
        if (data.updatedAt) tripRow.updatedAt = data.updatedAt;
        return { updatedAt: tripRow.updatedAt };
      }),
    },
    tripAttractionExploreCandidate: {
      findMany: jest.fn(async () => [
        {
          id: 'cand-1',
          placeId: 3,
          priority: 'very_interested',
          Place: {
            id: 3,
            nameCN: '黑沙滩',
            nameEN: 'Reynisfjara',
            category: 'beach',
            metadata: { lat: 63.4045, lng: -19.0484 },
          },
        },
      ]),
      findFirst: jest.fn(async () => ({ id: 'cand-1', placeId: 3 })),
    },
    place: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === 99 ? { id: 99 } : null,
      ),
      findMany: jest.fn(async ({ where }: { where: { id?: { in: number[] }; OR?: unknown } }) => {
        if (where?.id?.in) {
          return where.id.in.map((id) => {
            const meta: Record<number, { lat: number; lng: number; nameCN: string }> = {
              1: { lat: 63.6156, lng: -19.9885, nameCN: '塞里雅兰' },
              2: { lat: 63.5321, lng: -19.5112, nameCN: '斯科加' },
              3: { lat: 63.4045, lng: -19.0484, nameCN: '黑沙滩' },
            };
            const row = meta[id];
            return {
              id,
              nameCN: row?.nameCN ?? `place-${id}`,
              nameEN: null,
              metadata: row ? { lat: row.lat, lng: row.lng } : {},
            };
          });
        }
        return [
          {
            id: 88,
            nameCN: '蓝湖',
            nameEN: 'Blue Lagoon',
            category: 'ATTRACTION',
          },
        ];
      }),
      create: jest.fn(async () => ({ id: 77 })),
    },
    $queryRaw: jest.fn(async () => []),
    $executeRaw: jest.fn(async () => 1),
  };
  const snapshotAssembler = {
    assemble: jest.fn(async () => ({
      bindings: { constraintsVersion: 7 },
      effectivePlan: { versionId: 'plan-v7', hasEffectivePlan: true },
      tripOntologyFacts: [
        {
          factId: 'f-road-1',
          predicate: 'route.currentRoadStatus',
          subjectId: 'F208',
          value: { label: '高地道路封闭', status: '封闭', riskLevel: 'high' },
          observedAt: '2026-07-16T00:00:00Z',
          scope: {},
        },
      ],
    })),
  };
  const arrangeItems = {
    placeCandidate: jest.fn(async () => ({
      itineraryItem: { id: 'new-item-1' },
    })),
    createItem: jest.fn(async () => ({
      itineraryItem: { id: 'new-item-2' },
    })),
  };
  const contextNotifier = {
    notifyTripContextChanged: jest.fn(),
  };

  const service = new MobileSpatialRouteService(
    prisma as never,
    access as never,
    snapshotAssembler as never,
    arrangeItems as never,
    contextNotifier as never,
  );

  return { service, prisma, access, arrangeItems, contextNotifier, tripRow };
}

describe('MobileSpatialRouteService', () => {
  it('GET spatial-route projects [lng,lat] geometry', async () => {
    const { service, access } = makeSpatialService();
    const result = await service.getSpatialRoute('trip-1', 'u-1', { dayIndex: 1 });

    expect(access.assertTripMember).toHaveBeenCalledWith('trip-1', 'u-1');
    expect(result.map.polylines[0].coordinates[0]).toEqual([-19.9885, 63.6156]);
    expect(result.map.markers.filter((m) => m.type === 'confirmedPOI')).toHaveLength(2);
    expect(result.searchResults[0].id).toBe('cand-1');
    expect(result.dayMarkers[0].label).toBe('南岸');
    expect(result.routeWarning.roadName).toBe('F208');
    expect(result.contextVersion).toBeGreaterThan(0);
  });

  it('search returns items matching aggregate shape', async () => {
    const { service } = makeSpatialService();
    const result = await service.searchSpatialPois('trip-1', 'u-1', {
      q: '黑沙',
      dayIndex: 1,
      limit: 10,
    });
    expect(result.items.some((i) => i.id === 'cand-1')).toBe(true);
    expect(result.items.find((i) => i.id === 'cand-1')).toMatchObject({
      id: 'cand-1',
      title: '黑沙滩',
      matchPercent: 88,
    });
    expect(result.items[0].systemImage).toBeTruthy();
    expect(result.items[0].distanceInfo).toBeTruthy();
  });

  it('candidate detail exposes poiId and insertion options', async () => {
    const { service } = makeSpatialService();
    const detail = await service.getSpatialCandidate('trip-1', 'u-1', 'cand-1', {
      dayIndex: 1,
    });
    expect(detail.poiId).toBe('cand-1');
    expect(detail.placeId).toBe(3);
    expect(detail.insertionOptions.some((o) => o.isSelected && o.isRecommended)).toBe(true);
  });

  it('road-risks projects items[0] compatible with routeWarning', async () => {
    const { service } = makeSpatialService();
    const risks = await service.getRoadRisks('trip-1', 'u-1');
    expect(risks.items[0].roadName).toBe('F208');
    expect(risks.alertTitle).toContain('封闭');
    expect(risks.evidence.length).toBeGreaterThan(0);
  });

  it('insert requires If-Match and Idempotency-Key', async () => {
    const { service } = makeSpatialService();
    await expect(
      service.insertSpatialCandidate(
        'trip-1',
        'u-1',
        'cand-1',
        { dayIndex: 1, insertionOptionId: 'day-1-best' },
        {},
      ),
    ).rejects.toThrow(/If-Match/);
  });

  it('insert succeeds and bumps versions; replay is idempotent', async () => {
    const { service, arrangeItems, contextNotifier, tripRow } = makeSpatialService();
    const before = await service.getSpatialRoute('trip-1', 'u-1');

    const first = await service.insertSpatialCandidate(
      'trip-1',
      'u-1',
      'cand-1',
      { dayIndex: 1, insertionOptionId: 'day-1-best', slotTime: '10:00' },
      { ifMatch: before.contextVersion, idempotencyKey: 'idem-1' },
    );

    expect(arrangeItems.placeCandidate).toHaveBeenCalledTimes(1);
    expect(first.refreshSpatialRoute).toBe(true);
    expect(first.contextVersion).not.toBe(before.contextVersion);
    expect(first.planVersion).toBeGreaterThanOrEqual(3);
    expect(contextNotifier.notifyTripContextChanged).toHaveBeenCalled();
    expect(tripRow.metadata.spatialPlanVersion).toBe(3);

    const second = await service.insertSpatialCandidate(
      'trip-1',
      'u-1',
      'cand-1',
      { dayIndex: 1, insertionOptionId: 'day-1-best', slotTime: '10:00' },
      { ifMatch: before.contextVersion, idempotencyKey: 'idem-1' },
    );
    expect(arrangeItems.placeCandidate).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('insert returns CONTEXT_VERSION_CONFLICT on stale If-Match', async () => {
    const { service } = makeSpatialService();
    await expect(
      service.insertSpatialCandidate(
        'trip-1',
        'u-1',
        'cand-1',
        { dayIndex: 1, insertionOptionId: 'day-1-best' },
        { ifMatch: 1, idempotencyKey: 'idem-conflict' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('add location creates custom place and itinerary item', async () => {
    const { service, arrangeItems, prisma } = makeSpatialService();
    const before = await service.getSpatialRoute('trip-1', 'u-1');

    const result = await service.addSpatialLocation(
      'trip-1',
      'u-1',
      {
        lat: 63.5,
        lng: -19.5,
        title: '自定义观景点',
        dayIndex: 1,
      },
      { ifMatch: before.contextVersion, idempotencyKey: 'idem-loc-1' },
    );

    expect(prisma.place.create).toHaveBeenCalled();
    expect(arrangeItems.createItem).toHaveBeenCalled();
    expect(result.placeId).toBe(77);
    expect(result.refreshSpatialRoute).toBe(true);
  });
});
