import {
  deriveChunkCategory,
  expandChunkCategoryForRetrievalFilter,
} from './chunk-category-derive';

describe('deriveChunkCategory', () => {
  it('maps pois file to POI_INFO', () => {
    expect(
      deriveChunkCategory({
        filename: 'x.json',
        fileCategory: 'pois',
        chunkType: 'general',
        metadata: {},
      }),
    ).toBe('POI_INFO');
  });

  it('maps metadata f-road to RULES', () => {
    expect(
      deriveChunkCategory({
        filename: 'x.json',
        fileCategory: 'general',
        chunkType: 'section',
        metadata: { type: 'f-road' },
      }),
    ).toBe('RULES');
  });

  it('maps weather filename to WEATHER', () => {
    expect(
      deriveChunkCategory({
        filename: 'iceland-weather.json',
        fileCategory: 'general',
        chunkType: 'general',
        metadata: {},
      }),
    ).toBe('WEATHER');
  });

  it('maps road_status file category to ROAD_STATUS', () => {
    expect(
      deriveChunkCategory({
        filename: 'closures.json',
        fileCategory: 'road_status',
        chunkType: 'road_status',
        metadata: {},
      }),
    ).toBe('ROAD_STATUS');
  });

  it('maps metadata traffic_alert to TRAFFIC_ALERT', () => {
    expect(
      deriveChunkCategory({
        filename: 'x.json',
        fileCategory: 'general',
        chunkType: 'section',
        metadata: { type: 'traffic_alert' },
      }),
    ).toBe('TRAFFIC_ALERT');
  });
});

describe('expandChunkCategoryForRetrievalFilter', () => {
  it('expands RULES to include RISK_INFO', () => {
    expect(expandChunkCategoryForRetrievalFilter('RULES').sort()).toEqual(
      ['RISK_INFO', 'RULES'].sort(),
    );
  });

  it('expands DECISION_SUPPORT to include ROUTE_INFO', () => {
    expect(expandChunkCategoryForRetrievalFilter('DECISION_SUPPORT').sort()).toEqual(
      ['DECISION_SUPPORT', 'ROUTE_INFO'].sort(),
    );
  });

  it('expands POI_INFO to include GEOGRAPHY and POI_HOURS', () => {
    expect(expandChunkCategoryForRetrievalFilter('POI_INFO').sort()).toEqual(
      ['GEOGRAPHY', 'POI_HOURS', 'POI_INFO'].sort(),
    );
  });

  it('passes through unknown labels for exact DB match', () => {
    expect(expandChunkCategoryForRetrievalFilter('ROUTE_INFO')).toEqual(['ROUTE_INFO']);
  });

  it('normalizes casing for API keys', () => {
    expect(expandChunkCategoryForRetrievalFilter('rules')).toEqual(['RULES', 'RISK_INFO']);
  });

  it('expands GATE to dynamic road / traffic cluster', () => {
    expect(expandChunkCategoryForRetrievalFilter('GATE').sort()).toEqual(
      ['GATE', 'ROAD_STATUS', 'TRAFFIC_ALERT'].sort(),
    );
  });
});
