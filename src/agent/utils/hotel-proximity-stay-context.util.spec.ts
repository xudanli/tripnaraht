import {
  buildHotelProximityStayContext,
  classifyDayLoad,
  scoreAccommodationForProximityStay,
  buildProximityStayTradeoffZh,
} from './hotel-proximity-stay-context.util';

describe('hotel-proximity-stay-context', () => {
  const stayDay = {
    dayNumber: 2,
    dateYmd: '2026-06-02',
    itemCount: 5,
    lastStop: { lat: 63.5, lng: -19.0, nameZh: '斯科加瀑布', endHourUtc: 18 },
    firstStop: { lat: 64.1, lng: -21.9, nameZh: '雷克雅未克', startHourUtc: 9 },
    totalTravelMinutes: 150,
  };
  const anchorDay = {
    dayNumber: 3,
    dateYmd: '2026-06-03',
    itemCount: 4,
    firstStop: { lat: 64.0, lng: -16.9, nameZh: '斯瓦蒂瀑布营地', startHourUtc: 8 },
    lastStop: { lat: 63.9, lng: -16.5, nameZh: '冰河湖', endHourUtc: 17 },
    totalTravelMinutes: 120,
  };

  it('classifies heavy stay day', () => {
    expect(classifyDayLoad(stayDay)).toBe('moderate');
    expect(classifyDayLoad({ ...stayDay, itemCount: 7, totalTravelMinutes: 220 })).toBe('heavy');
  });

  it('scores closer to anchor and stay-day last stop higher', () => {
    const ctx = buildHotelProximityStayContext({ stayDay, anchorDay });
    const near = scoreAccommodationForProximityStay(
      { distance_to_anchor_km: 10, location: { lat: 63.55, lng: -16.95 } },
      ctx,
    );
    const far = scoreAccommodationForProximityStay(
      { distance_to_anchor_km: 10, location: { lat: 64.2, lng: -22 } },
      ctx,
    );
    expect(near).toBeLessThan(far);
  });

  it('mentions early start in tradeoff copy', () => {
    const ctx = buildHotelProximityStayContext({ stayDay, anchorDay });
    const zh = buildProximityStayTradeoffZh(ctx);
    expect(zh).toContain('第 2 天');
    expect(zh).toContain('第 3 天');
    expect(zh).toMatch(/早起|首站/);
  });
});
