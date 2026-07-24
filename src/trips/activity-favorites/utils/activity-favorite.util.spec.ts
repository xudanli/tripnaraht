import {
  buildItemTargetKey,
  buildPlaceTargetKey,
  extractFavoriteIdLists,
  mapFavoriteRows,
  resolveFavoriteTarget,
} from './activity-favorite.util';

describe('activity-favorite.util', () => {
  it('builds target keys', () => {
    expect(buildItemTargetKey('abc')).toBe('item:abc');
    expect(buildPlaceTargetKey(42)).toBe('place:42');
  });

  it('resolves itinerary item target', () => {
    const target = resolveFavoriteTarget({ itineraryItemId: 'item-1' });
    expect(target.targetKey).toBe('item:item-1');
    expect(target.placeId).toBeNull();
  });

  it('resolves place target', () => {
    const target = resolveFavoriteTarget({ placeId: 99 });
    expect(target.targetKey).toBe('place:99');
    expect(target.itineraryItemId).toBeNull();
  });

  it('throws when target missing', () => {
    expect(() => resolveFavoriteTarget({})).toThrow('MISSING_TARGET');
  });

  it('maps rows and extracts id lists', () => {
    const favorites = mapFavoriteRows([
      {
        targetKey: 'item:a',
        itineraryItemId: 'a',
        placeId: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
      {
        targetKey: 'place:5',
        itineraryItemId: null,
        placeId: 5,
        createdAt: new Date('2026-07-02T00:00:00Z'),
      },
    ]);
    const lists = extractFavoriteIdLists(favorites);
    expect(favorites).toHaveLength(2);
    expect(lists.itineraryItemIds).toEqual(['a']);
    expect(lists.placeIds).toEqual([5]);
  });
});
