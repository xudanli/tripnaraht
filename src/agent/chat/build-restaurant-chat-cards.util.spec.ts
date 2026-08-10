import {
  buildRestaurantChatCards,
  isRestaurantChatCardQuery,
} from './build-restaurant-chat-cards.util';

describe('build-restaurant-chat-cards.util', () => {
  it('detects restaurant card queries', () => {
    expect(isRestaurantChatCardQuery('8.16的，请为我推荐餐厅')).toBe(true);
    expect(isRestaurantChatCardQuery('推荐黄金圈附近的餐厅')).toBe(true);
    expect(isRestaurantChatCardQuery('明天天气')).toBe(false);
  });

  it('builds catalog cards for 8.16 dining ask with add-to-trip CTA', () => {
    const cards = buildRestaurantChatCards({
      userMessage: '8.16的，请为我推荐餐厅',
      tripStartYmd: '2026-08-15',
    });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.dayLabelZh).toBe('8月16日');
    expect(cards[0]!.cta_zh).toBe('加入行程');
    expect(
      cards[0]!.actions.some((a) => a.action === 'add_restaurant_to_itinerary'),
    ).toBe(true);
    expect(cards.some((c) => /黄金圈|塞尔福斯|Friðheimar|番茄/i.test(c.nameZh))).toBe(
      true,
    );
  });
});
