import { runTavilySearch } from './tavily-search.client';

describe('tavily-search.client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs advanced search and maps answer/results', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Road closed due to snow.',
        results: [{ title: 'T', url: 'https://x', content: 'closed' }],
        response_time: 1.2,
      }),
    }) as any;

    const out = await runTavilySearch({
      apiKey: 'test-key',
      query: 'Senja road conditions',
    });

    expect(out.answer).toContain('closed');
    expect(out.results?.length).toBe(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain('advanced');
  });
});
