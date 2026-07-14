import {
  compileAttractionExploreIntent,
  isAttractionExplorePlaceNameLookup,
} from './attraction-explore-intent-compiler.util';

describe('isAttractionExplorePlaceNameLookup', () => {
  it('treats 辛格维利尔国家公园 as a place-name lookup', () => {
    const intent = compileAttractionExploreIntent('辛格维利尔国家公园');
    expect(intent.routeContext).toBe('GOLDEN_CIRCLE');
    expect(isAttractionExplorePlaceNameLookup(intent)).toBe(true);
  });

  it('does not treat rainy-day intent as a place-name lookup', () => {
    const intent = compileAttractionExploreIntent('雨天适合去的室内博物馆');
    expect(isAttractionExplorePlaceNameLookup(intent)).toBe(false);
  });
});
