import { clearIcelandMarketPreferenceMatrixCache } from './load-iceland-market-preference-matrix';
import { resolveIcelandMarketSegment } from './resolve-iceland-market-segment';
import { applyIcelandMarketPriorToDecisionParams } from './apply-iceland-market-prior-to-decision-params';
import { createDefaultDecisionParams } from '../../../agent/memory/interfaces/decision-params.interface';

describe('resolveIcelandMarketSegment', () => {
  beforeEach(() => {
    clearIcelandMarketPreferenceMatrixCache();
  });

  it('routes US + July + en-US toward IS_MARKET_US', () => {
    const r = resolveIcelandMarketSegment({
      countryCode: 'IS',
      residencyCountry: 'US',
      locale: 'en-US',
      month: 7,
      userQuery: '7月冰岛南岸和黄金圈',
    });
    expect(r).not.toBeNull();
    expect(r!.segmentId).toBe('IS_MARKET_US');
    expect(r!.canonicalRouteId).toBe('IS-SOUTH-GOLDEN-5-7-LUX');
    expect(r!.routeDirectionName).toBe('IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX');
    expect(r!.confidence).toBeGreaterThan(0.5);
  });

  it('routes GB + January toward IS_MARKET_UK', () => {
    const r = resolveIcelandMarketSegment({
      countryCode: 'IS',
      residencyCountry: 'GB',
      locale: 'en-GB',
      month: 1,
      userQuery: '冰岛冬季极光短途',
    });
    expect(r?.segmentId).toBe('IS_MARKET_UK');
    expect(r?.canonicalRouteId).toBe('IS-WINTER-REYK-AURORA-4-5');
  });

  it('routes DE + 4x4 + August toward IS_MARKET_DACH_NORDIC', () => {
    const r = resolveIcelandMarketSegment({
      countryCode: 'IS',
      residencyCountry: 'DE',
      locale: 'de-DE',
      month: 8,
      vehicleClass: '4x4',
      userQuery: 'F208 高地穿越',
    });
    expect(r?.segmentId).toBe('IS_MARKET_DACH_NORDIC');
    expect(r?.rentalIntentProfile).toBe('f_road_focus');
  });

  it('routes CN + zh-CN toward IS_MARKET_EAST_ASIA', () => {
    const r = resolveIcelandMarketSegment({
      countryCode: 'IS',
      residencyCountry: 'CN',
      locale: 'zh-CN',
      month: 9,
      userQuery: '冰岛电影感摄影环岛 蝙蝠山',
    });
    expect(r?.segmentId).toBe('IS_MARKET_EAST_ASIA');
    expect(r?.routeDirectionTagAffinities.photography).toBe(1);
  });

  it('returns null without Iceland or market signals', () => {
    expect(resolveIcelandMarketSegment({ userQuery: '东京三日游' })).toBeNull();
  });
});

describe('applyIcelandMarketPriorToDecisionParams', () => {
  beforeEach(() => {
    clearIcelandMarketPreferenceMatrixCache();
  });

  it('raises stability bias for US segment at high confidence', () => {
    const resolution = resolveIcelandMarketSegment({
      countryCode: 'IS',
      residencyCountry: 'US',
      locale: 'en-US',
      month: 7,
    });
    expect(resolution).not.toBeNull();
    const params = createDefaultDecisionParams();
    const before = params.routeDirectionBias.stabilityWeight;
    applyIcelandMarketPriorToDecisionParams(params, resolution!);
    expect(params.routeDirectionBias.stabilityWeight).toBeGreaterThan(before);
  });
});
