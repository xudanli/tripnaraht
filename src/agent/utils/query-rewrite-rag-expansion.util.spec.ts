import {
  isQueryRewriteRagExpansionEnabled,
  ragRetrievalExpansionParams,
} from './query-rewrite-rag-expansion.util';

describe('query-rewrite-rag-expansion.util', () => {
  const prev = process.env.QUERY_REWRITE_RAG_EXPANSION_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.QUERY_REWRITE_RAG_EXPANSION_ENABLED;
    else process.env.QUERY_REWRITE_RAG_EXPANSION_ENABLED = prev;
  });

  it('默认关闭 expansion', () => {
    delete process.env.QUERY_REWRITE_RAG_EXPANSION_ENABLED;
    expect(isQueryRewriteRagExpansionEnabled()).toBe(false);
    expect(ragRetrievalExpansionParams()).toEqual({});
  });

  it('QUERY_REWRITE_RAG_EXPANSION_ENABLED=1 时开启', () => {
    process.env.QUERY_REWRITE_RAG_EXPANSION_ENABLED = '1';
    expect(isQueryRewriteRagExpansionEnabled()).toBe(true);
    expect(ragRetrievalExpansionParams()).toEqual({
      useQueryExpansion: true,
      maxQueryVariants: 3,
    });
  });
});
