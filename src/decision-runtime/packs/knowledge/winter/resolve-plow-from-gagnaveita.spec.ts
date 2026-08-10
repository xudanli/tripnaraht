import {
  resolvePlowFromGagnaveitaCode,
  resolvePlowFromStoredApiResponse,
  worsePlow,
} from './resolve-plow-from-gagnaveita';
import { mergePlowIntoRouteFacts } from './merge-plow-into-route-facts';
import type { RoadStatus } from '../../../../skills/world/services/road-status-realtime.service';
import type { IcelandSelfDriveRouteFacts } from '../demo/iceland-self-drive-route-facts.types';

describe('resolvePlowFromGagnaveitaCode', () => {
  it('maps 7X → DAILY with delay range', () => {
    const r = resolvePlowFromGagnaveitaCode('7X');
    expect(r?.plowServiceBand).toBe('DAILY');
    expect(r?.plowDelayRangeMin).toEqual([0, 30]);
  });

  it('maps EKKI_MOKAD → NOT_PLOWED without inventing delay', () => {
    const r = resolvePlowFromGagnaveitaCode('EKKI_MOKAD');
    expect(r?.plowServiceBand).toBe('NOT_PLOWED');
    expect(r?.plowDelayRangeMin).toBeUndefined();
  });

  it('keeps unknown codes as UNKNOWN without delay', () => {
    const r = resolvePlowFromGagnaveitaCode('XYZ99');
    expect(r?.plowRuleCode).toBe('XYZ99');
    expect(r?.plowServiceBand).toBe('UNKNOWN');
    expect(r?.plowDelayRangeMin).toBeUndefined();
  });

  it('returns undefined for null/empty', () => {
    expect(resolvePlowFromGagnaveitaCode(null)).toBeUndefined();
    expect(resolvePlowFromGagnaveitaCode('')).toBeUndefined();
  });
});

describe('resolvePlowFromStoredApiResponse', () => {
  it('reads embedded plow blob', () => {
    const r = resolvePlowFromStoredApiResponse({
      plow: { ruleCode: '5X', serviceBand: 'REDUCED', delayRangeMin: [15, 60] },
    });
    expect(r?.plowServiceBand).toBe('REDUCED');
    expect(r?.plowDelayRangeMin).toEqual([15, 60]);
  });

  it('reads raw Snjomokstursregla', () => {
    const r = resolvePlowFromStoredApiResponse({ Snjomokstursregla: '7X' });
    expect(r?.plowServiceBand).toBe('DAILY');
  });
});

describe('worsePlow / mergePlowIntoRouteFacts', () => {
  it('prefers NOT_PLOWED over DAILY', () => {
    const worse = worsePlow(
      resolvePlowFromGagnaveitaCode('7X'),
      resolvePlowFromGagnaveitaCode('EKKI_MOKAD'),
    );
    expect(worse?.plowServiceBand).toBe('NOT_PLOWED');
  });

  it('merges live RoadStatus plow into route facts', () => {
    const facts: IcelandSelfDriveRouteFacts = {
      roadSegmentIds: ['F208'],
    };
    const status: RoadStatus = {
      roadId: 'F208',
      currentStatus: 'open',
      lastVerifiedAt: new Date(),
      dataSource: 'vegagerdin',
      hazards: [],
      confidence: 0.9,
      seasonalFallback: false,
      plow: {
        ruleCode: '5X',
        serviceBand: 'REDUCED',
        delayRangeMin: [15, 60],
      },
    };
    const merged = mergePlowIntoRouteFacts(facts, [status]);
    expect(merged.winter?.snowPlow?.plowServiceBand).toBe('REDUCED');
    expect(merged.winter?.snowPlow?.plowDelayRangeMin).toEqual([15, 60]);
    expect(merged.winter?.snowPlow?.roadSegmentId).toBe('F208');
  });
});
