/**
 * LLM：从任意自然语言中判断是否包含「可跨会话遵守」的旅行偏好，并输出摘要条与可选结构化 hints。
 */

export const USER_PREFERENCE_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    has_standing_preference: {
      type: 'boolean',
      description: '用户是否在表达长期/默认偏好（而非一次性问答或命令执行）',
    },
    confidence: {
      type: 'number',
      description: '0-1，对 has_standing_preference 的置信度',
    },
    summary_bullets: {
      type: 'array',
      items: { type: 'string' },
      description: '最多 5 条、每条一句中文，可写入「用户摘要」；无则空数组',
    },
    structured_hints: {
      type: 'object',
      description: '可选：便于下游规则/检索使用的结构化片段，字段可部分为空',
      properties: {
        hotel_style: { type: 'string' },
        hotel_avoid: { type: 'array', items: { type: 'string' } },
        dining_preferences: { type: 'string' },
        transport_preferences: { type: 'string' },
        general: { type: 'string' },
      },
    },
  },
  required: ['has_standing_preference', 'confidence', 'summary_bullets'],
} as const;

export type UserPreferenceLlmExtraction = {
  has_standing_preference: boolean;
  confidence: number;
  summary_bullets: string[];
  structured_hints?: {
    hotel_style?: string;
    hotel_avoid?: string[];
    dining_preferences?: string;
    transport_preferences?: string;
    general?: string;
  };
};

export function buildUserPreferenceExtractionPrompt(userMessage: string): string {
  return [
    '你是 TripNARA 的「用户长期偏好」抽取器。只根据下面【用户原句】判断是否包含可跨多次对话遵守的偏好、口味或禁忌。',
    '',
    '判定为 has_standing_preference=true 的典型情况（示例，不限于）：',
    '- 以后 / 默认 / 记住 / 一律 / 尽量 / 永远 / 千万别 … 要怎样',
    '- 我喜欢 / 我偏好 / 我只住 / 我不住 / 不要连锁 …（稳定口味，而非单次「今晚订某酒店」）',
    '- 住宿风格：极简、暗黑风、小而美、民宿优先、不要五星级大堂等',
    '',
    '应为 false 的情况：',
    '- 普通问答、查价、单次预订指令、寒暄、与偏好无关的事实问题',
    '- 仅描述当前行程某一天怎么做，且无「以后都」类泛化',
    '',
    'summary_bullets：每条一句中文，动词开头或「偏好：」均可，总条数≤5；不要重复原句堆砌，要压缩成可执行摘要。',
    'structured_hints：若能映射则填 hotel_style / hotel_avoid 等；无法映射可留空对象。',
    'confidence：你对 has_standing_preference 的整体置信度 0~1。',
    '',
    '【用户原句】',
    userMessage.trim(),
    '',
    '只输出符合给定 JSON Schema 的一个 JSON 对象，一行，禁止 markdown 围栏与前后说明文字。',
  ].join('\n');
}
