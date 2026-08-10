import {
  buildFlightChatCards,
  isFlightChatCardQuery,
} from './build-flight-chat-cards.util';

describe('build-flight-chat-cards', () => {
  it('isFlightChatCardQuery matches 订机票话术', () => {
    expect(isFlightChatCardQuery('我要订杭州到成都机场的机票')).toBe(true);
  });

  it('buildFlightChatCards maps fliggy sample_offers', () => {
    const cards = buildFlightChatCards({
      flightInventorySnapshot: {
        provider: 'fliggy',
        legs: [
          {
            sample_offers: [
              {
                id: 'fliggy-1',
                titleZh: '国航 CA4501 杭州→成都',
                summaryLineZh: '国航 CA4501 杭州→成都 · 约 ¥680',
                priceLabel: '约 ¥680',
                url: 'https://router.feizhu.com/x',
                source: 'fliggy',
                cta_zh: '去飞猪订票',
              },
            ],
          },
        ],
      },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('fliggy-1');
    expect(cards[0]?.source).toBe('fliggy');
    expect(cards[0]?.priceLabel).toContain('680');
    expect(cards[0]?.reasonZh).toBeTruthy();
    expect(cards[0]?.fields_zh?.some((f) => f.key === 'price')).toBe(true);
    expect(cards[0]?.fields_zh?.some((f) => f.key === 'reason')).toBe(true);
    expect(cards[0]?.actions?.[0]?.params?.url).toContain('feizhu');
  });

  it('buildFlightChatCards recovers ticketPrice when priceLabel missing', () => {
    const cards = buildFlightChatCards({
      flightInventorySnapshot: {
        legs: [
          {
            sample_offers: [
              {
                id: 'f2',
                titleZh: '川航 3U6936 杭州→成都',
                ticketPrice: '720.00',
                airlineZh: '川航',
                flightNo: '3U6936',
                url: 'https://router.feizhu.com/y',
                source: 'fliggy',
              },
            ],
          },
        ],
      },
    });
    expect(cards[0]?.priceLabel).toMatch(/720/);
    expect(cards[0]?.fields_zh?.find((f) => f.key === 'price')?.label).toBe('价格');
  });
});

