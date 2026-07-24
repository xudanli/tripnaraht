import { resolveNorwaySubregionForWorldBuild } from './world-model-production-guards.util';

describe('resolveNorwaySubregionForWorldBuild', () => {
  it('returns lofoten for explicit subregion', () => {
    expect(resolveNorwaySubregionForWorldBuild({ countryCode: 'NO', subregion: 'lofoten' })).toBe('lofoten');
  });

  it('returns lofoten when user message mentions Reine', () => {
    expect(
      resolveNorwaySubregionForWorldBuild({
        countryCode: 'NO',
        userMessage: 'Plan a week in Reine and Hamnøy',
      }),
    ).toBe('lofoten');
  });

  it('returns undefined for generic Oslo trip (no regional file injection)', () => {
    expect(
      resolveNorwaySubregionForWorldBuild({
        countryCode: 'NO',
        userMessage: 'Oslo to Bergen road trip',
      }),
    ).toBeUndefined();
  });
});
