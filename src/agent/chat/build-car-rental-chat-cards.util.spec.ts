import {
  buildCarRentalChatCards,
  isCarRentalChatCardQuery,
  mapBookingCarRentalsToChatCards,
} from './build-car-rental-chat-cards.util';

describe('build-car-rental-chat-cards.util', () => {
  it('detects car rental card queries', () => {
    expect(isCarRentalChatCardQuery('请为我推荐租车公司')).toBe(true);
    expect(isCarRentalChatCardQuery('冰岛租车报价')).toBe(true);
    expect(isCarRentalChatCardQuery('成都租车，拉萨还车')).toBe(true);
    expect(isCarRentalChatCardQuery('我想在康定租一辆越野车')).toBe(true);
    expect(isCarRentalChatCardQuery('明天天气')).toBe(false);
  });

  it('maps booking rows to cards with price and CTA', () => {
    const cards = mapBookingCarRentalsToChatCards(
      [
        {
          id: 'c1',
          company: 'Blue Car Rental',
          vehicle_type: 'SUV',
          price: { amount: 420, currency: 'USD' },
          pickup_location: { address: 'Keflavik Airport' },
          url: 'https://example.com/offer/1',
        },
      ],
      { pickUpDate: '2026-08-15', dropOffDate: '2026-08-22' },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.nameZh).toContain('Blue Car Rental');
    expect(cards[0]!.priceLabel).toContain('420');
    expect(cards[0]!.cta_zh).toBe('查看报价');
    expect(cards[0]!.source).toBe('booking_com');
    expect(cards[0]!.actions[0]!.action).toBe('open_car_rental_url');
  });

  it('falls back to catalog when no booking or guidance', () => {
    const cards = buildCarRentalChatCards({
      userMessage: '推荐租车公司',
    });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.source).toBe('catalog_fallback');
    expect(cards[0]!.url).toMatch(/^https?:\/\//);
    expect(cards.some((c) => /Blue/i.test(c.nameZh))).toBe(true);
  });

  it('prefers guidance brands when booking empty', () => {
    const cards = buildCarRentalChatCards({
      userMessage: '推荐租车',
      icelandRentalGuidance: {
        trusted_local_providers: [
          {
            id: 'blue',
            name: 'Blue Car Rental',
            url: 'https://www.bluecarrental.is/',
            positioning_zh: '本地高信任',
            trust_tags: ['trusted_default'],
          },
        ],
        aggregation_portals: [
          {
            id: 'northbound',
            name: 'Northbound',
            url: 'https://www.northbound.is/',
            role_zh: '比价入口',
          },
        ],
      },
    });
    expect(cards[0]!.source).toBe('iceland_rental_guidance');
    expect(cards.some((c) => c.cta_zh === '去比价')).toBe(true);
  });
});
