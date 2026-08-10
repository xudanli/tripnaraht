import {
  extractAccommodationOtaRef,
  upsertAccommodationPlaceForApply,
} from './upsert-accommodation-place.util';

describe('upsert-accommodation-place.util', () => {
  it('extracts fliggy otaRef from source+id', () => {
    expect(extractAccommodationOtaRef({ id: '78309218', source: 'fliggy' })).toEqual({
      provider: 'fliggy',
      externalId: '78309218',
    });
  });

  it('upserts fliggy hotel without coordinates (OTA-first)', async () => {
    const created: Array<Record<string, unknown>> = [];
    const id = await upsertAccommodationPlaceForApply(
      {
        findByGooglePlaceId: async () => null,
        findByExternalRef: async () => null,
        createPlace: async (data) => {
          created.push(data);
          return { id: 9001 };
        },
        updatePlaceRow: async () => undefined,
        setLocation: async () => undefined,
        resolveCityId: async () => 42,
      },
      {
        id: '78309218',
        source: 'fliggy',
        name: '汉庭康定318国道酒店',
        address: '康定市',
        otaRef: { provider: 'fliggy', externalId: '78309218' },
      },
      '汉庭康定318国道酒店',
      { cityHint: '康定' },
    );

    expect(id).toBe(9001);
    expect(created).toHaveLength(1);
    expect(created[0]?.cityId).toBe(42);
    expect(created[0]?.dataSource).toBe('fliggy');
    expect((created[0]?.metadata as any)?.fliggyShId).toBe('78309218');
    expect((created[0]?.metadata as any)?.externalId).toBe('78309218');
  });

  it('reuses existing Place by fliggy externalId', async () => {
    let updatedId: number | null = null;
    const id = await upsertAccommodationPlaceForApply(
      {
        findByGooglePlaceId: async () => null,
        findByExternalRef: async (provider, externalId) =>
          provider === 'fliggy' && externalId === 'sh-1' ? { id: 55 } : null,
        createPlace: async () => {
          throw new Error('should not create');
        },
        updatePlaceRow: async (args) => {
          updatedId = args.id;
        },
      },
      {
        id: 'sh-1',
        source: 'fliggy',
        name: '已存在酒店',
        listing_lat: 30.1,
        listing_lng: 101.9,
      },
      '已存在酒店',
    );
    expect(id).toBe(55);
    expect(updatedId).toBe(55);
  });

  it('does not create google hotel without coords', async () => {
    const id = await upsertAccommodationPlaceForApply(
      {
        findByGooglePlaceId: async () => null,
        findByExternalRef: async () => null,
        createPlace: async () => ({ id: 1 }),
        updatePlaceRow: async () => undefined,
      },
      {
        id: 'ChIJxxxxxxxxxxxxxxxxxxxxxx',
        source: 'hotel',
        name: 'No coords google hotel',
      },
      'No coords google hotel',
    );
    expect(id).toBeUndefined();
  });
});
