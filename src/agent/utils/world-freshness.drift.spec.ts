import {
  cognitiveDomainsForDriftedDimensions,
  driftedFreshnessDimensions,
} from './world-freshness.drift';

describe('world-freshness.drift', () => {
  it('driftedFreshnessDimensions only counts keys present on both sides with differing values', () => {
    expect(
      driftedFreshnessDimensions(
        { weatherVersion: 'a', mapVersion: 'm1' },
        { weatherVersion: 'b', mapVersion: 'm1' },
      ),
    ).toEqual(['weatherVersion']);
  });

  it('cognitiveDomainsForDriftedDimensions merges mapping', () => {
    expect(cognitiveDomainsForDriftedDimensions(['weatherVersion', 'trafficVersion']).sort()).toEqual(
      ['OUTDOOR_ROUTE', 'ROUTE_ETA', 'TRANSPORT_TIMING'].sort(),
    );
  });
});
