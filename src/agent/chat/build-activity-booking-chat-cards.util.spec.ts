import {
  buildActivityBookingChatCards,
  extractScheduleActivityReferent,
  isActivityAdvanceBookingConsultQuery,
} from './build-activity-booking-chat-cards.util';

describe('build-activity-booking-chat-cards.util', () => {
  describe('isActivityAdvanceBookingConsultQuery (P1 predicate convergence)', () => {
    it('Case1: 可以帮我去预订吗，冰川徒步', () => {
      expect(isActivityAdvanceBookingConsultQuery('可以帮我去预订吗，冰川徒步')).toBe(true);
    });

    it('Case2: 冰川徒步需要提前订吗', () => {
      expect(isActivityAdvanceBookingConsultQuery('冰川徒步需要提前订吗')).toBe(true);
    });

    it('Case3: 给我蓝湖的订票链接', () => {
      expect(isActivityAdvanceBookingConsultQuery('给我蓝湖的订票链接')).toBe(true);
    });

    it('负例: 帮我订酒店 / 帮我租车', () => {
      expect(isActivityAdvanceBookingConsultQuery('帮我订酒店')).toBe(false);
      expect(isActivityAdvanceBookingConsultQuery('帮我租车')).toBe(false);
      expect(isActivityAdvanceBookingConsultQuery('推荐酒店')).toBe(false);
    });

    it('负例: 这个需要提前订吗？无 activity referent', () => {
      expect(isActivityAdvanceBookingConsultQuery('这个需要提前订吗？')).toBe(false);
    });

    it('指代 + activity referent / 日程锚点 → true', () => {
      expect(
        isActivityAdvanceBookingConsultQuery('这个需要提前订吗？', {
          activityReferent: '冰川徒步',
        }),
      ).toBe(true);
      expect(
        isActivityAdvanceBookingConsultQuery(
          '这个需要提前订吗？\n\n[日程] Day4 Day 4 · 冰川徒步...',
        ),
      ).toBe(true);
    });

    it('经典提前预订咨询仍命中', () => {
      expect(isActivityAdvanceBookingConsultQuery('有哪些景点是需要我提前预定的？')).toBe(true);
      expect(isActivityAdvanceBookingConsultQuery('活动预订')).toBe(true);
    });

    it('extractScheduleActivityReferent', () => {
      expect(
        extractScheduleActivityReferent('[日程] Day4 Day 4 · 冰川徒步...'),
      ).toMatch(/冰川徒步/);
    });
  });

  it('builds jump cards from trip NEED_BOOKING glacier + answer boat/lagoon', () => {
    const cards = buildActivityBookingChatCards({
      userMessage: '有哪些景点是需要我提前预定的？',
      answerText:
        '冰川徒步（索尔黑马冰川）必须提前预订；杰古沙龙冰河湖船游需购票；蓝湖若前往也需订票。',
      tripItems: [
        {
          id: '1',
          name: '塞里雅兰瀑布',
          dayNumber: 3,
          dayDate: '2026-08-17',
          bookingStatus: 'NEED_BOOKING',
        },
        {
          id: '2',
          name: '索尔黑马冰川',
          dayNumber: 3,
          dayDate: '2026-08-17',
          bookingStatus: 'NEED_BOOKING',
        },
      ],
    });
    expect(cards.some((c) => c.id === 'glacier_hike')).toBe(true);
    expect(cards.some((c) => c.id === 'jokulsarlon_boat')).toBe(true);
    expect(cards.some((c) => c.id === 'blue_lagoon')).toBe(true);
    expect(cards.every((c) => /^https:\/\//.test(c.url))).toBe(true);
    expect(cards.find((c) => c.id === 'glacier_hike')?.cta_zh).toBe('去预订');
    // 瀑布不应因错误 NEED_BOOKING 出卡
    expect(cards.some((c) => /瀑布/.test(c.nameZh))).toBe(false);
  });

  it('prefers item.bookingUrl when present', () => {
    const cards = buildActivityBookingChatCards({
      userMessage: '活动预订',
      tripItems: [
        {
          id: 'x',
          name: '蓝湖',
          bookingUrl: 'https://example.com/blue',
          bookingStatus: 'NEED_BOOKING',
        },
      ],
    });
    expect(cards[0]?.url).toBe('https://example.com/blue');
  });

  it('China trip uses 携程/飞猪/去哪儿 jump links', () => {
    const cards = buildActivityBookingChatCards({
      countryCode: 'CN',
      userMessage: '帮我预订九寨沟门票',
      tripItems: [
        {
          id: 'cn-1',
          name: '九寨沟风景名胜区',
          dayNumber: 2,
          bookingStatus: 'NEED_BOOKING',
        },
      ],
    });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.url).toContain('ctrip.com');
    expect(cards[0]?.bookingLinks?.map((l) => l.provider)).toEqual([
      'ctrip',
      'fliggy',
      'qunar',
    ]);
  });
});

