import {
  extractActivityOtaRef,
  upsertActivityPlaceForApply,
} from './upsert-activity-place.util';

describe('upsert-activity-place.util', () => {
  it('extracts fliggy otaRef from source+id', () => {
    expect(extractActivityOtaRef({ id: 'poi-318', source: 'fliggy' })).toEqual({
      provider: 'fliggy',
      externalId: 'poi-318',
    });
  });

  it('upserts fliggy attraction without coordinates (OTA-first)', async () => {
    const created: Array<Record<string, unknown>> = [];
    const id = await upsertActivityPlaceForApply(
      {
        findByExternalRef: async () => null,
        createPlace: async (data) => {
          created.push(data);
          return { id: 8001 };
        },
        updatePlaceRow: async () => undefined,
        setLocation: async () => undefined,
        resolveCityId: async () => 7906,
      },
      {
        id: 'poi-318',
        source: 'fliggy',
        name: '海螺沟冰川森林公园',
        address: '泸定县',
        otaRef: { provider: 'fliggy', externalId: 'poi-318' },
        category: 'ATTRACTION_TICKET',
      },
      '海螺沟冰川森林公园',
      { cityHint: '泸定' },
    );

    expect(id).toBe(8001);
    expect(created).toHaveLength(1);
    expect(created[0]?.category).toBe('ATTRACTION');
    expect(created[0]?.cityId).toBe(7906);
    expect(created[0]?.dataSource).toBe('fliggy');
    expect((created[0]?.metadata as any)?.fliggyPoiId).toBe('poi-318');
    expect((created[0]?.metadata as any)?.externalId).toBe('poi-318');
  });

  it('reuses existing Place by fliggy externalId', async () => {
    let updatedId: number | null = null;
    const id = await upsertActivityPlaceForApply(
      {
        findByExternalRef: async (provider, externalId) =>
          provider === 'fliggy' && externalId === 'poi-1' ? { id: 66 } : null,
        createPlace: async () => {
          throw new Error('should not create');
        },
        updatePlaceRow: async (args) => {
          updatedId = args.id;
        },
      },
      {
        id: 'poi-1',
        source: 'fliggy',
        name: '已存在景点',
        listing_lat: 29.6,
        listing_lng: 102.1,
      },
      '已存在景点',
    );
    expect(id).toBe(66);
    expect(updatedId).toBe(66);
  });

  it('does not create unknown activity without coords', async () => {
    const id = await upsertActivityPlaceForApply(
      {
        findByExternalRef: async () => null,
        createPlace: async () => ({ id: 1 }),
        updatePlaceRow: async () => undefined,
      },
      {
        id: 'local-1',
        source: 'unknown',
        name: 'No coords unknown',
      },
      'No coords unknown',
    );
    expect(id).toBeUndefined();
  });
});
