import {
  isStructuredClarificationEchoMessage,
  isWorkbenchAssistantPlaceholderMessage,
  resolveCanonicalIntakeUserMessage,
  rebuildTripPlanMessagePreservingSystemBlocks,
} from './trip-plan-intake-message.util';

describe('trip-plan-intake-message.util', () => {
  const realUser =
    '我们已经预订了6月5日开始的7天冰岛行程，打算利用极昼午夜阳光，体验24小时随时错峰自驾环岛，把一号公路开透。';
  const echo = `按您本轮诉求：用户希望利用极昼\n\n针对该诉求的可行性：不可行\n\n安全节奏：test`;

  it('detects clarification echo', () => {
    expect(isStructuredClarificationEchoMessage(realUser)).toBe(false);
    expect(isStructuredClarificationEchoMessage(echo)).toBe(true);
  });

  it('resolveCanonicalIntakeUserMessage keeps prior NL when request is echo', () => {
    expect(
      resolveCanonicalIntakeUserMessage({
        requestMessage: echo,
        previousIntake: realUser,
      }),
    ).toBe(realUser);
  });

  it('rebuildTripPlanMessagePreservingSystemBlocks keeps system prefix', () => {
    const msg = `[SYSTEM_MESSAGE][PHYSICAL_CAPABILITY]\n### hint\n\n${echo}`;
    const out = rebuildTripPlanMessagePreservingSystemBlocks(msg, realUser);
    expect(out).toContain('[SYSTEM_MESSAGE]');
    expect(out).toContain('6月5日');
    expect(out).not.toContain('按您本轮诉求');
  });

  it('detects workbench assistant placeholder welcome echo', () => {
    const welcome =
      '行程助手 Nara  已关联当前行程  在这一页提问、检索攻略或说明想怎么改日程；我会带上当前行程上下文回答。 可选快捷语句：  查攻略 / 实况 检查日程是否合理 餐饮与停留';
    expect(isWorkbenchAssistantPlaceholderMessage(welcome)).toBe(true);
    expect(isWorkbenchAssistantPlaceholderMessage('第二天的行程给我推荐酒店')).toBe(false);
  });
});
