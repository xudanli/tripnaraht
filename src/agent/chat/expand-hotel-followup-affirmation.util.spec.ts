import {
  assistantOffersHotelInventoryFollowup,
  expandHotelFollowupAffirmation,
  isShortHotelFollowupAffirmation,
} from './expand-hotel-followup-affirmation.util';
import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';

describe('expand-hotel-followup-affirmation.util', () => {
  const offer =
    '**下一步：**\n- 如需，我可筛选霍芬当晚2–3家可订房源及实时价格。\n8月19日建议住在霍芬。';

  it('detects short affirmations', () => {
    expect(isShortHotelFollowupAffirmation('需要')).toBe(true);
    expect(isShortHotelFollowupAffirmation('好的')).toBe(true);
    expect(isShortHotelFollowupAffirmation('OK')).toBe(true);
    expect(isShortHotelFollowupAffirmation('推荐酒店')).toBe(false);
  });

  it('detects hotel follow-up offer in assistant text', () => {
    expect(assistantOffersHotelInventoryFollowup(offer)).toBe(true);
    expect(assistantOffersHotelInventoryFollowup('今天天气不错')).toBe(false);
  });

  it('expands 需要 after Hofn hotel offer into inventory query', () => {
    const out = expandHotelFollowupAffirmation({
      message: '需要',
      recentMessages: [
        '用户: 推荐8.19的酒店',
        `助手: ${offer}`,
      ],
    });
    expect(out).toContain('霍芬');
    expect(out).toContain('8月19日');
    expect(out).toContain('可订酒店');
    expect(isHotelInventorySearchQuery(out, out.toLowerCase())).toBe(true);
  });

  it('leaves unrelated short yes alone when no hotel offer', () => {
    expect(
      expandHotelFollowupAffirmation({
        message: '需要',
        recentMessages: ['助手: 是否继续自动修复行程？'],
      }),
    ).toBe('需要');
  });

  it('strips [日程] DayN and expands 需要 into Day2 hotel inventory query', () => {
    const msg = '需要\n\n[日程] Day2 Day 2 · 黄金圈';
    expect(isShortHotelFollowupAffirmation(msg)).toBe(true);
    const out = expandHotelFollowupAffirmation({ message: msg });
    expect(out).toContain('第2天');
    expect(out).toContain('可订酒店');
    expect(isHotelInventorySearchQuery(out)).toBe(true);
  });

  it('expands 需要 after prior user lodging preference even without assistant offer', () => {
    const out = expandHotelFollowupAffirmation({
      message: '需要\n\n[日程] Day2 Day 2 · 黄金圈',
      recentMessages: [
        '用户: 第二天换一个离第三天更近、性价比高的酒店',
        '助手: 已记下偏好。',
      ],
    });
    expect(out).toContain('第2天');
    expect(isHotelInventorySearchQuery(out)).toBe(true);
  });

  it('leaves non-affirmations unchanged', () => {
    expect(
      expandHotelFollowupAffirmation({
        message: '推荐8.19的酒店',
        recentMessages: [`助手: ${offer}`],
      }),
    ).toBe('推荐8.19的酒店');
  });
});
