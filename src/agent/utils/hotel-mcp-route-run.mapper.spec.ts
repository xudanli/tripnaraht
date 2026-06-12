import {
  extractHotelListingDisplayName,
  mapHotelMcpDataForRouteAndRun,
  countStayNightsBetweenInclusive,
  pickSpreadNightIndices,
  pickFullTripReplanNightIndices,
  mergeSegmentHotelSearchResults,
  addDaysYmd,
  parseExplicitHotelNightScopeIndices,
  parseHotelProximityAnchorDayNumber,
  parseExplicitStayWindowFromUserMessage,
  narrowHotelStayWindowWithNlMessage,
  resolveHotelStayDatesForBoundTrip,
  shouldSkipHotelDateClarification,
  messageExpressesMultiNightStayPlanningIntent,
  inferNightIndex0FromExplicitStayInTripWindow,
  diffCalendarDaysYmd,
  haversineKm,
  attachDistanceToAnchorForCards,
  buildAccommodationDecisionSupportZh,
} from './hotel-mcp-route-run.mapper';

describe('hotel-mcp-route-run.mapper', () => {
  it('extracts Airbnb nested title for prompt / cards', () => {
    const row = {
      id: '123',
      demandStayListing: {
        description: {
          name: { localizedStringWithTranslationPreference: 'Cozy cabin near Vik' },
        },
      },
      url: 'https://airbnb.example/l/123',
    };
    expect(extractHotelListingDisplayName(row)).toBe('Cozy cabin near Vik');
  });

  it('maps airbnb dispatcher payload to route_and_run hotel UI', () => {
    const data = {
      success: true,
      source: 'airbnb' as const,
      results: [
        {
          id: '1',
          demandStayListing: {
            description: {
              name: { localizedStringWithTranslationPreference: 'Sea view apt' },
            },
          },
          structuredDisplayPrice: {
            primaryLine: { accessibilityLabel: '112 EUR per night' },
          },
          url: 'https://airbnb.example/l/1',
        },
      ],
      totalResults: 1,
    };
    const m = mapHotelMcpDataForRouteAndRun(data);
    expect(m).not.toBeNull();
    expect(m!.routing).toEqual({ target: 'hotel' });
    expect(m!.accommodations[0].name).toBe('Sea view apt');
    expect(m!.accommodations[0].priceLabel).toBe('112 EUR per night');
    expect(m!.accommodations[0].source).toBe('airbnb');
  });

  it('counts inclusive stay nights between check-in and check-out', () => {
    expect(countStayNightsBetweenInclusive('2026-06-01', '2026-06-07')).toBe(6);
    expect(countStayNightsBetweenInclusive('2026-06-01', '2026-06-02')).toBe(1);
  });

  it('pickSpreadNightIndices caps and spreads samples', () => {
    expect(pickSpreadNightIndices(6, 5)).toHaveLength(5);
    expect(pickSpreadNightIndices(3, 5)).toEqual([0, 1, 2]);
  });

  it('pickFullTripReplanNightIndices covers every night when within cap', () => {
    expect(pickFullTripReplanNightIndices(5, 6)).toEqual([0, 1, 2, 3, 4]);
    expect(pickFullTripReplanNightIndices(6, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pickFullTripReplanNightIndices(8, 6)).toHaveLength(6);
  });

  it('mergeSegmentHotelSearchResults attaches itineraryHintZh per segment', () => {
    const payload = {
      success: true,
      source: 'airbnb' as const,
      results: [
        {
          id: 'a',
          demandStayListing: {
            description: {
              name: { localizedStringWithTranslationPreference: 'Flat A' },
            },
          },
          structuredDisplayPrice: {
            primaryLine: { accessibilityLabel: '90 EUR' },
          },
        },
      ],
      totalResults: 1,
    };
    const merged = mergeSegmentHotelSearchResults(
      [
        {
          data: payload,
          segment: {
            labelZh: '第1/3晚 · 雷克雅未克周边',
            nightIndex: 1,
            checkIn: '2026-06-01',
            checkOut: '2026-06-02',
          },
        },
      ],
      {
        stayWindowNightCount: 3,
        itineraryTotalNights: 6,
        sampledNightIndices: [1],
      },
    );
    expect(merged?.accommodations[0].itineraryHintZh).toContain('雷克雅未克');
    expect(merged?.accommodations[0].stayLabelZh).toBe('住1晚（06/01—06/02）');
    expect(merged?.accommodations[0].nightIndex).toBe(1);
    expect(merged?.accommodations[0].name_en).toBeUndefined();
    expect(merged?.hotel_search_meta?.strategy).toBe('per_night_sample');
    expect(merged?.hotel_search_meta?.total_nights).toBe(3);
    expect(merged?.hotel_search_meta?.itinerary_total_nights).toBe(6);
  });

  it('addDaysYmd rolls calendar correctly', () => {
    expect(addDaysYmd('2026-06-01', 1)).toBe('2026-06-02');
  });

  it('parseExplicitHotelNightScopeIndices narrows to asked nights', () => {
    expect(parseExplicitHotelNightScopeIndices('第1晚住雷克雅未克', 6)).toEqual([0]);
    expect(parseExplicitHotelNightScopeIndices('第一晚推荐酒店', 6)).toEqual([0]);
    expect(parseExplicitHotelNightScopeIndices('第2晚和第3晚', 6)).toEqual([1, 2]);
    expect(
      parseExplicitHotelNightScopeIndices(
        '帮我安排一个行程 第1天应该住哪里，请给我推荐酒店',
        6,
      ),
    ).toEqual([0]);
    expect(
      parseExplicitHotelNightScopeIndices('第二天的行程给我推荐酒店', 6),
    ).toEqual([1]);
    expect(
      parseExplicitHotelNightScopeIndices('第三天的行程推荐住宿', 6),
    ).toEqual([2]);
    expect(parseExplicitHotelNightScopeIndices('整个行程酒店推荐', 6)).toBeNull();
    expect(parseExplicitHotelNightScopeIndices('推荐酒店', 6)).toBeNull();
  });

  it('parseHotelProximityAnchorDayNumber reads day for distance sorting', () => {
    expect(
      parseHotelProximityAnchorDayNumber('最好离第三天的行程要近'),
    ).toBe(3);
    expect(
      parseHotelProximityAnchorDayNumber('第二天的行程给我推荐酒店，并且最好离第三天的行程要近'),
    ).toBe(3);
  });

  it('narrowHotelStayWindowWithNlMessage narrows via day-scoped hotel intent without calendar dates', () => {
    expect(
      narrowHotelStayWindowWithNlMessage({
        baseCheckIn: '2026-06-01',
        baseCheckOut: '2026-06-07',
        message: '第二天的行程给我推荐酒店，并且最好离第三天的行程要近',
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-02', checkOut: '2026-06-03' });
  });

  it('shouldSkipHotelDateClarification for bound trip scoped hotel ask', () => {
    expect(
      shouldSkipHotelDateClarification({
        message: '第二天的行程给我推荐酒店，并且最好离第三天的行程要近',
        tripId: 'trip-1',
        checkIn: '2026-06-02',
        checkOut: '2026-06-03',
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toBe(true);
    expect(
      shouldSkipHotelDateClarification({
        message: '推荐酒店',
        tripId: 'trip-1',
        checkIn: '2026-06-01',
        checkOut: '2026-06-07',
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toBe(true);
  });

  it('resolveHotelStayDatesForBoundTrip prefers day scope over router full-trip params', () => {
    expect(
      resolveHotelStayDatesForBoundTrip({
        message: '第二天的行程给我推荐酒店，并且最好离第三天的行程要近',
        paramsCheckIn: '2026-06-01',
        paramsCheckOut: '2026-06-07',
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-02', checkOut: '2026-06-03' });
  });

  it('haversineKm is sensible for short distances', () => {
    const reykjavik = { lat: 64.1466, lng: -21.9426 };
    const nearby = { lat: 64.15, lng: -21.95 };
    const d = haversineKm(reykjavik.lat, reykjavik.lng, nearby.lat, nearby.lng);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(50);
  });

  it('buildAccommodationDecisionSupportZh combines prefs party and listing hints', () => {
    const zh = buildAccommodationDecisionSupportZh(
      {
        id: 'x',
        source: 'airbnb',
        name: 'Test',
        rating: 4.9,
        nightIndex: 1,
        listing_lat: 64.14,
        listing_lng: -21.94,
        distance_to_anchor_km: 0.8,
        anchor_poi_name_zh: '锚点餐厅',
        priceLabel: '$519 for 1 night',
      },
      {
        structuredContent: { primaryLine: '2 bedrooms · 4 beds' },
        personCapacity: 4,
      },
      {
        party_total: 5,
        has_children: true,
        cost_sensitivity: 0.7,
      },
    );
    expect(zh).toBeTruthy();
    expect(zh).toMatch(/5/);
    expect(zh).toMatch(/4/);
  });

  it('attachDistanceToAnchorForCards writes distance_label_zh', () => {
    const cards = attachDistanceToAnchorForCards(
      [
        {
          id: '1',
          source: 'airbnb',
          name: 'A',
          nightIndex: 1,
          listing_lat: 64.1466,
          listing_lng: -21.9426,
        },
      ],
      new Map([[1, { lat: 64.15, lng: -21.95, nameZh: '测试餐厅' }]]),
    );
    expect(cards[0].distance_to_anchor_km).toBeDefined();
    expect(cards[0].distance_label_zh).toMatch(/测试餐厅/);
  });

  it('attachDistanceToAnchorForCards omits absurd distance (>250km or off-Iceland coords)', () => {
    const anchor = { lat: 64.255, lng: -21.129, nameZh: '辛格维利尔国家公园' };
    const far = attachDistanceToAnchorForCards(
      [
        {
          id: '1',
          source: 'airbnb',
          name: 'Far listing',
          nightIndex: 1,
          listing_lat: 40.7,
          listing_lng: -74.0,
        },
      ],
      new Map([[1, anchor]]),
    );
    expect(far[0].distance_to_anchor_km).toBeUndefined();

    const wrongSign = attachDistanceToAnchorForCards(
      [
        {
          id: '2',
          source: 'airbnb',
          name: 'Wrong lng sign',
          nightIndex: 1,
          listing_lat: 64.14,
          listing_lng: 21.94,
        },
      ],
      new Map([[1, anchor]]),
    );
    expect(wrongSign[0].distance_to_anchor_km).toBeUndefined();
  });

  it('parseExplicitStayWindowFromUserMessage reads NL and clamps to trip', () => {
    expect(parseExplicitStayWindowFromUserMessage('就住 2026-06-03 一晚', {})).toEqual({
      checkIn: '2026-06-03',
      checkOut: '2026-06-04',
    });
    expect(
      parseExplicitStayWindowFromUserMessage('2026-06-01 到 2026-06-07', {
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-01', checkOut: '2026-06-07' });
  });

  it('parseExplicitStayWindowFromUserMessage reads 入住/退房 and slash without 到', () => {
    expect(
      parseExplicitStayWindowFromUserMessage('6月2日入住，6月3日退房', {
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-02', checkOut: '2026-06-03' });
    expect(
      parseExplicitStayWindowFromUserMessage('6/2入住 6/3退房', {
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-02', checkOut: '2026-06-03' });
    expect(
      parseExplicitStayWindowFromUserMessage('2026-06-02入住 2026-06-03退房', {
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-02', checkOut: '2026-06-03' });
  });

  it('parseExplicitStayWindowFromUserMessage reads 同月「6月5–7日」简写（en dash）', () => {
    const msg = '6月5\u20137日维克镇双人含早';
    expect(
      parseExplicitStayWindowFromUserMessage(msg, {
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-10',
      }),
    ).toEqual({ checkIn: '2026-06-05', checkOut: '2026-06-07' });
  });

  it('parseExplicitStayWindowFromUserMessage tolerates spaces around 月 and dash', () => {
    expect(
      parseExplicitStayWindowFromUserMessage('6 月 5 - 7 日维克含早', {
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-10',
      }),
    ).toEqual({ checkIn: '2026-06-05', checkOut: '2026-06-07' });
  });

  it('narrowHotelStayWindowWithNlMessage narrows full-trip base when message states sub-range', () => {
    expect(
      narrowHotelStayWindowWithNlMessage({
        baseCheckIn: '2026-06-01',
        baseCheckOut: '2026-06-07',
        message: '6月5-7日维克镇双人含早，每晚预算1500',
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-05', checkOut: '2026-06-07' });
  });

  it('narrowHotelStayWindowWithNlMessage does not widen a narrower base', () => {
    expect(
      narrowHotelStayWindowWithNlMessage({
        baseCheckIn: '2026-06-03',
        baseCheckOut: '2026-06-05',
        message: '6月1日到7日帮我看看酒店',
        tripStartYmd: '2026-06-01',
        tripEndYmd: '2026-06-07',
      }),
    ).toEqual({ checkIn: '2026-06-03', checkOut: '2026-06-05' });
  });

  it('inferNightIndex0FromExplicitStayInTripWindow maps a single-night message to night index', () => {
    expect(diffCalendarDaysYmd('2026-06-01', '2026-06-02')).toBe(1);
    expect(
      inferNightIndex0FromExplicitStayInTripWindow(
        '维克附近 6/2入住 6/3退房',
        '2026-06-01',
        6,
        '2026-06-07',
      ),
    ).toBe(1);
    expect(
      inferNightIndex0FromExplicitStayInTripWindow('帮我看看全程酒店', '2026-06-01', 6, '2026-06-07'),
    ).toBeNull();
  });

  it('inferNightIndex0 does not narrow when user asks for daily accommodation replan (multi-night intent)', () => {
    expect(
      messageExpressesMultiNightStayPlanningIntent(
        '冰岛行程6月5-7日重新规划为逆时针环岛，并更新每日住宿城镇。',
      ),
    ).toBe(true);
    expect(
      inferNightIndex0FromExplicitStayInTripWindow(
        '冰岛行程6月5-7日重新规划为逆时针环岛，并更新每日住宿城镇。顾问建议 6/5入住 6/6退房先看一间。',
        '2026-06-01',
        14,
        '2026-06-14',
      ),
    ).toBeNull();
  });

  it('messageExpressesMultiNightStayPlanningIntent stays false for single-night hotel asks', () => {
    expect(messageExpressesMultiNightStayPlanningIntent('第3晚雷克雅未克有没有民宿')).toBe(false);
    expect(messageExpressesMultiNightStayPlanningIntent('维克附近 6/2入住 6/3退房')).toBe(false);
  });
});
