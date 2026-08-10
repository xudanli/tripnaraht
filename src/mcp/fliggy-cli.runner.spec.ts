import { isFliggyRateLimitError } from './fliggy-cli.runner';

describe('isFliggyRateLimitError', () => {
  it('识别 MCP HTTP 429 / Rate limit', () => {
    expect(
      isFliggyRateLimitError('MCP HTTP 429: Rate limit exceeded'),
    ).toBe(true);
    expect(isFliggyRateLimitError('Error: too many requests')).toBe(true);
    expect(isFliggyRateLimitError('status 429 from gateway')).toBe(true);
  });

  it('非限流错误返回 false', () => {
    expect(isFliggyRateLimitError('destName 必填')).toBe(false);
    expect(isFliggyRateLimitError('ECONNREFUSED')).toBe(false);
    expect(isFliggyRateLimitError(null)).toBe(false);
  });
});
