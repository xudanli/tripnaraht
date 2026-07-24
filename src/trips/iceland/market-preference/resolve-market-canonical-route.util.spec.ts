import {
  ICELAND_MARKET_CANONICAL_TO_ROUTE_DIRECTION_NAME,
  resolveRouteDirectionNameFromMarketCanonical,
  resolveRouteDirectionNameForSegment,
} from './resolve-market-canonical-route.util';
import { clearIcelandMarketPreferenceMatrixCache } from './load-iceland-market-preference-matrix';

describe('resolve-market-canonical-route', () => {
  beforeEach(() => {
    clearIcelandMarketPreferenceMatrixCache();
  });

  it('maps all four canonical shells to fixture names', () => {
    expect(Object.keys(ICELAND_MARKET_CANONICAL_TO_ROUTE_DIRECTION_NAME)).toHaveLength(4);
    expect(resolveRouteDirectionNameFromMarketCanonical('IS-CINEMATIC-RING-9')).toBe(
      'IS_MARKET_EAST_ASIA_CINEMATIC_RING_9',
    );
  });

  it('resolves by segment id via matrix', () => {
    expect(resolveRouteDirectionNameForSegment('IS_MARKET_UK')).toBe(
      'IS_MARKET_UK_WINTER_REYK_AURORA_4_5',
    );
  });
});
