import { resolveClarificationIntroAnswerText } from './resolve-clarification-intro.runner';

describe('resolve-clarification-intro.runner', () => {
  it('reads locale from metadata', () => {
    const text = resolveClarificationIntroAnswerText({
      metadata: { clarification_locale: 'zh' },
    } as any);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});
