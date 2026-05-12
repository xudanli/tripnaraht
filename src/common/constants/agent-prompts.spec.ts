import {
  clarificationIntroPlain,
  resolveClarificationLocale,
  clarificationGapMissingDatesDeparture,
} from './agent-prompts';

describe('agent-prompts', () => {
  it('resolveClarificationLocale maps en variants', () => {
    expect(resolveClarificationLocale(undefined)).toBe('zh');
    expect(resolveClarificationLocale('zh-CN')).toBe('zh');
    expect(resolveClarificationLocale('en')).toBe('en');
    expect(resolveClarificationLocale('en-US')).toBe('en');
  });

  it('clarificationIntroPlain switches by locale', () => {
    expect(clarificationIntroPlain('zh-CN')).toContain('行程');
    expect(clarificationIntroPlain('en')).toContain('trip');
  });

  it('clarificationGapMissingDatesDeparture provides EN copy', () => {
    const en = clarificationGapMissingDatesDeparture('en');
    expect(en.question).toMatch(/travel/i);
  });
});
