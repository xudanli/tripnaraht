const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

export interface TavilySearchResultItem {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

export interface TavilySearchResponse {
  query: string;
  answer?: string;
  results?: TavilySearchResultItem[];
  response_time?: number;
}

/**
 * Tavily Search API（advanced depth，多源聚合）。
 * @see https://docs.tavily.com
 */
export async function runTavilySearch(input: {
  apiKey: string;
  query: string;
  signal?: AbortSignal;
  maxResults?: number;
}): Promise<TavilySearchResponse> {
  const maxResults = Math.min(15, Math.max(3, input.maxResults ?? 8));
  const res = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: input.apiKey,
      query: input.query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: maxResults,
    }),
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    query: input.query,
    answer: typeof json.answer === 'string' ? json.answer : undefined,
    results: Array.isArray(json.results) ? (json.results as TavilySearchResultItem[]) : [],
    response_time: typeof json.response_time === 'number' ? json.response_time : undefined,
  };
}
