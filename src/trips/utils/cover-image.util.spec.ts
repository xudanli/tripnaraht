import {
  collectPlaceImages,
  collectTripPoiImages,
  hashTripId,
  pickCoverImageByTripId,
  resolveTripCoverImageUrl,
} from './cover-image.util';

describe('cover-image.util', () => {
  it('collectPlaceImages gathers direct fields and uploaded images', () => {
    const urls = collectPlaceImages({
      imageUrl: 'https://cdn.example.com/direct.jpg',
      images: [
        { url: 'https://cdn.example.com/upload-a.jpg', isPrimary: true },
        { url: 'https://cdn.example.com/upload-b.jpg' },
      ],
    });

    expect(urls).toEqual([
      'https://cdn.example.com/direct.jpg',
      'https://cdn.example.com/upload-a.jpg',
      'https://cdn.example.com/upload-b.jpg',
    ]);
  });

  it('collectTripPoiImages deduplicates across places in order', () => {
    const urls = collectTripPoiImages([
      { imageUrl: 'https://cdn.example.com/a.jpg' },
      { images: [{ url: 'https://cdn.example.com/a.jpg' }, { url: 'https://cdn.example.com/b.jpg' }] },
    ]);

    expect(urls).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
  });

  it('uses explicit cover when source is poi or user', () => {
    const metadata = {
      coverImageSource: 'user',
      coverImageUrl: 'https://cdn.example.com/user-cover.jpg',
    };

    expect(
      resolveTripCoverImageUrl('trip-1', metadata, ['https://cdn.example.com/poi.jpg']),
    ).toBe('https://cdn.example.com/user-cover.jpg');
  });

  it('picks POI image by hash when source is auto or unset', () => {
    const poiImages = [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
    ];
    const tripId = 'trip-abc-123';
    const expected = poiImages[hashTripId(tripId) % poiImages.length];

    expect(resolveTripCoverImageUrl(tripId, { coverImageSource: 'auto' }, poiImages)).toBe(
      expected,
    );
    expect(resolveTripCoverImageUrl(tripId, {}, poiImages)).toBe(expected);
    expect(pickCoverImageByTripId(tripId, poiImages)).toBe(expected);
  });

  it('falls back to country cover when POI pool is empty', () => {
    expect(
      resolveTripCoverImageUrl(
        'trip-1',
        { coverImageSource: 'auto' },
        [],
        'https://cdn.example.com/iceland.jpg',
      ),
    ).toBe('https://cdn.example.com/iceland.jpg');
  });

  it('returns null when no POI images, country cover, or explicit cover', () => {
    expect(resolveTripCoverImageUrl('trip-1', { coverImageSource: 'auto' }, [], null)).toBeNull();
    expect(resolveTripCoverImageUrl('trip-1', {}, [], null)).toBeNull();
  });
});
