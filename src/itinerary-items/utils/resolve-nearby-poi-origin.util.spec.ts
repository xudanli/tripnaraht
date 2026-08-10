import {
  pickBestPlaceNameMatch,
  resolveCoordsFromLabel,
} from './resolve-nearby-poi-origin.util';

describe('resolve-nearby-poi-origin.util', () => {
  it('resolves Keflavik airport label', () => {
    expect(resolveCoordsFromLabel('凯夫拉维克机场')).toEqual({
      lat: 63.985,
      lng: -22.605,
      source: 'label:KEF',
    });
  });

  it('resolves Reykjavik label', () => {
    expect(resolveCoordsFromLabel('雷克雅未克市区')?.source).toBe('label:Reykjavik');
  });

  it('picks transit hub for airport note', () => {
    const best = pickBestPlaceNameMatch('凯夫拉维克机场', [
      {
        nameCN: '酒店 · Hotel Keflavik',
        nameEN: 'Hotel Keflavik',
        category: 'HOTEL',
      },
      {
        nameCN: '凯夫拉维克国际机场',
        nameEN: 'Keflavik International Airport (KEF/BIKF)',
        category: 'TRANSIT_HUB',
      },
    ]);
    expect(best?.category).toBe('TRANSIT_HUB');
  });
});
