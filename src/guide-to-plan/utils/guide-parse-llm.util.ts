import type { GuideParseResult } from '../types/guide-to-plan.types';

/** LLM structured output schema for guide parsing */
export const GUIDE_PARSE_LLM_SCHEMA = {
  type: 'object',
  properties: {
    themeNarrative: {
      type: 'string',
      description: '攻略的旅行主线，一句话概括体验主题',
    },
    suggestedTripDays: {
      type: 'number',
      description: '攻略暗示或明确提到的行程天数',
    },
    places: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          nameEn: { type: 'string' },
          type: {
            type: 'string',
            enum: ['poi', 'restaurant', 'hotel', 'activity', 'route_theme'],
          },
          suggestedDay: { type: 'number' },
          routeOrder: { type: 'number' },
          stayDurationMinutes: { type: 'number' },
        },
        required: ['name', 'type'],
        additionalProperties: false,
      },
    },
    routes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'number' },
          description: { type: 'string' },
          placeNames: { type: 'array', items: { type: 'string' } },
          transportMode: { type: 'string' },
        },
        required: ['description', 'placeNames'],
        additionalProperties: false,
      },
    },
    tips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          category: { type: 'string' },
          relatedPlaceName: { type: 'string' },
        },
        required: ['text'],
        additionalProperties: false,
      },
    },
    implicitAssumptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assumption: { type: 'string' },
          category: {
            type: 'string',
            enum: ['transport', 'fitness', 'season', 'group', 'other'],
          },
        },
        required: ['assumption'],
        additionalProperties: false,
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claimType: { type: 'string' },
          subjectName: { type: 'string' },
          statement: { type: 'string' },
        },
        required: ['claimType', 'statement'],
        additionalProperties: false,
      },
    },
  },
  required: ['places', 'themeNarrative'],
  additionalProperties: false,
};

export function buildGuideParsePrompt(text: string, countryCode?: string | null): string {
  const destHint = countryCode ? `目的地国家代码：${countryCode}` : '目的地未指定';
  return `你是 TripNARA 攻略解析助手。从以下旅行攻略中提取结构化信息。

重要规则：
1. 区分「事实地点」与「作者观点/经验」——观点放入 claims，不要当成硬约束。
2. 识别隐含假设（如默认自驾、默认年轻人、默认夏季、默认高强度）。
3. 提取 POI、餐厅、住宿区域、活动；标注 suggestedDay 和 routeOrder（若攻略有顺序）。
4. claimType 示例：stay_duration | season_warning | booking_required | photo_tip | transport_assumption | not_recommended
5. 不要编造攻略未提及的地点。

${destHint}

攻略内容：
"""
${text.slice(0, 12000)}
"""

请以 JSON 返回，符合 schema。`;
}

export function normalizeLlmParseResult(raw: unknown): GuideParseResult {
  const obj = raw as Record<string, unknown>;
  const places = Array.isArray(obj.places)
    ? obj.places.map((p: Record<string, unknown>, idx: number) => ({
        name: String(p.name ?? '').trim(),
        nameEn: p.nameEn ? String(p.nameEn).trim() : undefined,
        type: (p.type as GuideParseResult['places'][0]['type']) ?? 'poi',
        suggestedDay: typeof p.suggestedDay === 'number' ? p.suggestedDay : undefined,
        routeOrder: typeof p.routeOrder === 'number' ? p.routeOrder : idx + 1,
        stayDurationMinutes:
          typeof p.stayDurationMinutes === 'number' ? p.stayDurationMinutes : undefined,
      }))
    : [];

  const routes = Array.isArray(obj.routes)
    ? obj.routes.map((r: Record<string, unknown>) => ({
        day: typeof r.day === 'number' ? r.day : undefined,
        description: String(r.description ?? ''),
        placeNames: Array.isArray(r.placeNames) ? r.placeNames.map(String) : [],
        transportMode: r.transportMode ? String(r.transportMode) : undefined,
      }))
    : [];

  const tips = Array.isArray(obj.tips)
    ? obj.tips.map((t: Record<string, unknown>) => ({
        text: String(t.text ?? ''),
        category: t.category ? String(t.category) : undefined,
        relatedPlaceName: t.relatedPlaceName ? String(t.relatedPlaceName) : undefined,
      }))
    : [];

  const implicitAssumptions = Array.isArray(obj.implicitAssumptions)
    ? obj.implicitAssumptions.map((a: Record<string, unknown>) => ({
        assumption: String(a.assumption ?? ''),
        category: a.category as GuideParseResult['implicitAssumptions'][0]['category'],
      }))
    : [];

  const llmClaims = Array.isArray(obj.claims)
    ? obj.claims.map((c: Record<string, unknown>) => ({
        claimType: String(c.claimType ?? 'experience_tip'),
        subjectName: c.subjectName ? String(c.subjectName) : undefined,
        statement: String(c.statement ?? ''),
      }))
    : [];

  const tipClaims = tips.map((t) => ({
    claimType: 'experience_tip',
    subjectName: t.relatedPlaceName,
    statement: t.text,
  }));

  return {
    places: places.filter((p) => p.name.length >= 2),
    routes,
    tips,
    implicitAssumptions,
    claims: [...llmClaims, ...tipClaims],
    themeNarrative: obj.themeNarrative ? String(obj.themeNarrative) : undefined,
    suggestedTripDays:
      typeof obj.suggestedTripDays === 'number' && obj.suggestedTripDays >= 1
        ? Math.min(30, Math.round(obj.suggestedTripDays))
        : undefined,
  };
}
