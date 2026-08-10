import {
  buildMissingParamClarificationMessage,
  extractSolutionsFromError,
  translateParamName,
} from './missing-param-clarification.runner';

describe('missing-param-clarification.runner', () => {
  it('translates known param names', () => {
    expect(translateParamName('countryCode')).toBe('目的地国家');
  });

  it('builds clarification with solutions for countryCode', () => {
    const msg = buildMissingParamClarificationMessage({
      message: 'countryCode 是必需的',
    });
    expect(msg).toContain('目的地国家');
    expect(extractSolutionsFromError({ message: 'countryCode missing' }).length).toBeGreaterThan(0);
  });
});
