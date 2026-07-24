import { resolveAttractionExplorePlaceCoordinates } from './attraction-explore-place-coordinates.util';

describe('resolveAttractionExplorePlaceCoordinates', () => {
  it('falls back to Iceland name aliases when metadata lacks coords', () => {
    expect(
      resolveAttractionExplorePlaceCoordinates({
        id: 381382,
        nameCN: '辛格维利尔',
        nameEN: 'Thingvellir',
      }),
    ).toEqual({ lat: 64.255, lng: -21.129 });
  });

  it('prefers postgis coords over aliases', () => {
    expect(
      resolveAttractionExplorePlaceCoordinates(
        { id: 381084, nameCN: '黄金瀑布', nameEN: 'Gullfoss' },
        { lat: 64.3253, lng: -20.1237 },
      ),
    ).toEqual({ lat: 64.3253, lng: -20.1237 });
  });

  it('resolves highland trail names without PostGIS', () => {
    expect(
      resolveAttractionExplorePlaceCoordinates({
        id: 381422,
        nameCN: '索斯默克',
        nameEN: 'Thorsmork',
      }),
    ).toEqual({ lat: 63.683, lng: -19.511 });
  });
});
