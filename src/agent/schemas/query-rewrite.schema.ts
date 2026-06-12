/**
 * Stage 1 结构化解析 Schema（不含 expansion_routes，由 Stage 2 确定性/生成式扩展补齐）。
 */
export const QUERY_REWRITE_STAGE1_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    original_query: { type: 'string' },
    contextualized_query: { type: 'string' },
    standardized_query: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        poi: { type: 'string' },
        category: { type: 'string' },
        rank_level: { type: 'string' },
        duration: { type: 'string' },
        time_range: { type: 'string' },
        filters: { type: 'object' },
      },
    },
    discard_previous_destination: {
      type: 'boolean',
      description: '用户是否明确更换目的地，为 true 时不得继承上一轮目的地',
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['original_query', 'contextualized_query', 'standardized_query', 'confidence'],
};

/** 完整输出 Schema（含 expansion_routes，用于测试或全量 LLM 路径） */
export const QUERY_REWRITE_FULL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    ...(QUERY_REWRITE_STAGE1_SCHEMA.properties as Record<string, unknown>),
    expansion_routes: {
      type: 'object',
      properties: {
        synonym: { type: 'array', items: { type: 'string' } },
        hyponym: { type: 'array', items: { type: 'string' } },
        scenario: { type: 'array', items: { type: 'string' } },
      },
      required: ['synonym', 'hyponym', 'scenario'],
    },
  },
  required: [
    'original_query',
    'contextualized_query',
    'expansion_routes',
    'standardized_query',
    'confidence',
  ],
};
