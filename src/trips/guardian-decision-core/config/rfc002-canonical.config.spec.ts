import {
  isCanonicalExcessiveDailyLoadEnabled,
  isCanonicalRoadSegmentUnavailableEnabled,
  isCanonicalWeatherActivityProhibitedEnabled,
} from './rfc002-canonical.config';

describe('rfc002-canonical.config (Phase 3)', () => {
  const prevRoad = process.env.RFC001_ICELAND_ROAD_CLOSE;
  const prevCanon = process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE;

  afterEach(() => {
    if (prevRoad === undefined) delete process.env.RFC001_ICELAND_ROAD_CLOSE;
    else process.env.RFC001_ICELAND_ROAD_CLOSE = prevRoad;
    if (prevCanon === undefined) delete process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE;
    else process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE = prevCanon;
  });

  it('P3-FLAG-001: legacy RFC001 env aliases canonical road flag', () => {
    delete process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE;
    process.env.RFC001_ICELAND_ROAD_CLOSE = '1';
    expect(isCanonicalRoadSegmentUnavailableEnabled()).toBe(true);
  });

  it('P3-FLAG-002: canonical env name works without legacy alias', () => {
    delete process.env.RFC001_ICELAND_ROAD_CLOSE;
    process.env.CANONICAL_ROAD_SEGMENT_UNAVAILABLE = '1';
    expect(isCanonicalRoadSegmentUnavailableEnabled()).toBe(true);
    expect(isCanonicalWeatherActivityProhibitedEnabled()).toBe(false);
    expect(isCanonicalExcessiveDailyLoadEnabled()).toBe(false);
  });
});
