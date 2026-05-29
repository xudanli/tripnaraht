import {
  isStructuredClarificationEchoMessage,
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
});
