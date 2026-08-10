import { unwrapMcpToolResult } from './xiaohongshu-mcp.client';

describe('unwrapMcpToolResult', () => {
  it('parses JSON text content', () => {
    const out = unwrapMcpToolResult({
      content: [{ type: 'text', text: '{"feeds":[{"id":"1"}]}' }],
    });
    expect(out).toEqual({ feeds: [{ id: '1' }] });
  });

  it('throws on isError', () => {
    expect(() =>
      unwrapMcpToolResult({
        isError: true,
        content: [{ type: 'text', text: 'login required' }],
      }),
    ).toThrow(/login required/);
  });
});
