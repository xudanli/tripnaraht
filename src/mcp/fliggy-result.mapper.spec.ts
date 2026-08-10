import {
  mapFliggyActivityRows,
  mapFliggyCommerceRows,
  mapFliggyFlightRows,
  mapFliggyHotelRows,
} from './fliggy-result.mapper';

describe('fliggy-result.mapper', () => {
  it('maps hotel rows with detailUrl / mainPic', () => {
    const cards = mapFliggyHotelRows({
      hotels: [
        {
          hotelId: '10001',
          name: '西湖边酒店',
          detailUrl: 'https://hotel.fliggy.com/detail/1',
          mainPic: 'https://img.example/a.jpg',
          price: '688',
          score: 4.8,
          address: '杭州市',
        },
      ],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.source).toBe('fliggy');
    // 统一 H5：主链为官方 https，不透传 App Scheme
    expect(cards[0]?.url).toBe('https://hotel.fliggy.com/detail/1');
    expect(cards[0]?.webUrl).toBe('https://hotel.fliggy.com/detail/1');
    expect(cards[0]?.appUrl).toBeUndefined();
    expect(cards[0]?.openStrategy).toBe('web');
    expect(cards[0]?.bookingProvider).toBe('fliggy');
    expect(cards[0]?.priceLabel).toContain('688');
    expect(cards[0]?.photoUrl).toContain('img.example');
    expect(cards[0]?.imageUrl).toBe(cards[0]?.photoUrl);
  });

  it('maps FlyAI live shape data.itemList', () => {
    const cards = mapFliggyHotelRows(
      {
        data: {
          itemList: [
            {
              shId: '71348127',
              name: '维也纳智好酒店(太古里宽窄巷子店)',
              detailUrl: 'https://router.feizhu.com/ws/3oIXxQ',
              mainPic:
                'https://img.alicdn.com/imgextra/i2/O1CN01Yym6tR2DS3n6tVE73_!!0-alitrip.jpg',
              price: '¥402',
              address: '过街楼街17号',
              interestsPoi: '近宽窄巷子景区',
            },
          ],
        },
      },
      { checkInDate: '2026-08-21', checkOutDate: '2026-08-22' },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('71348127');
    expect(cards[0]?.url).toBe('https://router.feizhu.com/ws/3oIXxQ');
    expect(cards[0]?.webUrl).toContain('router.feizhu.com');
    expect(cards[0]?.bookingLinks?.[0]?.url).toContain('router.feizhu.com');
    expect(cards[0]?.priceLabel).toBe('¥402');
    expect(cards[0]?.photoUrl).toContain('%21%21');
    expect(cards[0]?.imageUrl).toContain('alicdn.com');
  });

  it('unwraps keyword-search itemList[].info for ticket titles', () => {
    const cards = mapFliggyActivityRows({
      data: {
        itemList: [
          {
            info: {
              title: '[康定情歌（木格措）风景区-大门票+观光车]成人票',
              jumpUrl: 'https://router.feizhu.com/ws/ticket1',
              price: null,
            },
          },
        ],
      },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.nameZh).toContain('木格措');
    expect(cards[0]?.url).toContain('router.feizhu.com');
  });

  it('maps poi rows with jumpUrl', () => {
    const cards = mapFliggyActivityRows({
      pois: [
        {
          poiId: 'p1',
          name: '九寨沟',
          jumpUrl: 'https://travel.fliggy.com/ticket/1',
          price: 190,
        },
      ],
    });
    expect(cards[0]?.url).toContain('fliggy.com');
    expect(cards[0]?.url.startsWith('https://')).toBe(true);
    expect(cards[0]?.bookingLinks?.[0]?.provider).toBe('fliggy');
    expect(cards[0]?.cta_zh).toBe('去飞猪预订');
  });

  it('maps flight rows with journeys/segments + jumpUrl', () => {
    const cards = mapFliggyFlightRows({
      data: {
        itemList: [
          {
            id: 'f1',
            adultPrice: '1280',
            totalDuration: '2h40m',
            jumpUrl: 'https://router.feizhu.com/ws/flight1',
            journeys: [
              {
                segments: [
                  {
                    marketingTransportName: '国航',
                    marketingTransportNo: 'CA4401',
                    depCityName: '成都',
                    arrCityName: '拉萨',
                    depDateTime: '2026-09-01 08:10',
                    arrDateTime: '2026-09-01 10:50',
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.source).toBe('fliggy');
    expect(cards[0]?.flightNo).toBe('CA4401');
    expect(cards[0]?.url).toContain('router.feizhu.com');
    expect(cards[0]?.cta_zh).toBe('去飞猪订票');
    expect(cards[0]?.summaryLineZh).toContain('成都');
  });

  it('maps ticketPrice (real fliggy search-flight field) + reasonZh', () => {
    const cards = mapFliggyFlightRows({
      data: {
        itemList: [
          {
            ticketPrice: '600.00',
            totalDuration: '185',
            jumpUrl: 'https://router.feizhu.com/ws/flight2',
            journeys: [
              {
                journeyType: '直达',
                segments: [
                  {
                    marketingTransportName: '国航',
                    marketingTransportNo: 'CA8339',
                    depCityName: '杭州',
                    arrCityName: '成都',
                    depDateTime: '2026-08-21 06:35:00',
                    arrDateTime: '2026-08-21 09:40:00',
                    seatClassName: '经济舱',
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.priceLabel).toBe('¥600');
    expect(cards[0]?.durationLabel).toContain('小时');
    expect(cards[0]?.reasonZh).toMatch(/直达|国航|CA8339/);
    expect(cards[0]?.summaryLineZh).toContain('¥600');
  });

  it('maps commerce rows for car_rental and restaurant', () => {
    const cars = mapFliggyCommerceRows(
      {
        itemList: [
          {
            title: '拉萨机场租车SUV',
            jumpUrl: 'https://travel.fliggy.com/car/1',
            price: '299',
            tags: ['租车'],
          },
          {
            title: '拉萨城北那里民宿',
            jumpUrl: 'https://travel.fliggy.com/hotel/1',
            tags: [],
          },
        ],
      },
      { category: 'car_rental' },
    );
    expect(cars).toHaveLength(1);
    expect(cars[0]?.category).toBe('car_rental');
    expect(cars[0]?.cta_zh).toBe('去飞猪租车');
    expect(cars[0]?.url.startsWith('https://')).toBe(true);
    expect(cars[0]?.reasonZh).toMatch(/飞猪|川藏|比价|取还/);

    const priced = mapFliggyCommerceRows(
      {
        itemList: [
          {
            title: '日均66元起飞猪全国随心租44城经济型租车卡含基础保障周末可用',
            jumpUrl: 'https://travel.fliggy.com/car/2',
            price: null,
            tags: ['租车'],
          },
        ],
      },
      { category: 'car_rental' },
    );
    expect(priced[0]?.priceLabel).toMatch(/66/);
    expect(priced[0]?.reasonZh).toMatch(/经济型|比价/);

    const eats = mapFliggyCommerceRows(
      {
        itemList: [
          {
            name: '康定牦牛肉火锅',
            detailUrl: 'https://travel.fliggy.com/food/1',
            priceLabel: '¥88',
            tags: ['美食', '火锅'],
          },
        ],
      },
      { category: 'restaurant' },
    );
    expect(eats[0]?.category).toBe('restaurant');
    expect(eats[0]?.cta_zh).toBe('去飞猪查看');
  });
});
