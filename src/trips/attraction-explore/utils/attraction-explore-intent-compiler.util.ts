import { ATTRACTION_EXPLORE_SUITABILITIES, ATTRACTION_EXPLORE_THEMES } from '../constants/attraction-explore-catalog.constants';

export type ExploreMobilityRequirement = 'LOW_INTENSITY' | 'MEDIUM' | 'HIGH';
export type ExploreWeatherMode = 'ALL_WEATHER' | 'RAINY_DAY' | 'OUTDOOR';

export interface AttractionExploreCompiledIntent {
  rawQuery: string;
  themes: string[];
  suitableFor: string[];
  mobilityRequirement?: ExploreMobilityRequirement;
  parkingRequired?: boolean;
  routeContext?: string;
  maxDetourMinutes?: number;
  weatherMode?: ExploreWeatherMode;
  excludeVisited?: boolean;
  keywords: string[];
  matchedPhrases: string[];
}

const THEME_PATTERNS: Array<{ themeId: string; pattern: RegExp }> = [
  { themeId: 'first_time_essentials', pattern: /第一次|首次|必去|must.?see|经典/i },
  { themeId: 'nature_landscapes', pattern: /自然|风景|景观|nature|scenic/i },
  { themeId: 'waterfalls', pattern: /瀑布|foss|waterfall/i },
  { themeId: 'hot_springs', pattern: /温泉|地热|blue lagoon|lagoon|浴/i },
  { themeId: 'glaciers', pattern: /冰川|冰河|冰湖|glacier|lagoon/i },
  { themeId: 'highlands', pattern: /高地|highland|内陆/i },
  { themeId: 'photography', pattern: /摄影|拍照|打卡|photo/i },
  { themeId: 'culture_history', pattern: /博物馆|文化|历史|城市|museum|culture/i },
];

const SUITABILITY_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'family', pattern: /亲子|家庭|带娃|family|kids/i },
  { id: 'couple', pattern: /情侣|二人|couple/i },
  { id: 'solo', pattern: /独行|一个人|solo/i },
  { id: 'seniors', pattern: /老人|长辈|父母|老年|senior|elderly/i },
  { id: 'adventure_seekers', pattern: /冒险|探险|徒步|adventure|hike/i },
  { id: 'relaxed_pace', pattern: /轻松|悠闲|慢节奏|relaxed|easy/i },
];

const ROUTE_PATTERNS: Array<{ context: string; pattern: RegExp }> = [
  { context: 'GOLDEN_CIRCLE', pattern: /黄金圈|golden circle|辛格维利尔|间歇泉|黄金瀑布/i },
  { context: 'SOUTH_COAST', pattern: /南岸|south coast|维克|黑沙滩|冰河湖|钻石/i },
  { context: 'RING_ROAD', pattern: /环岛|一号环|ring road|ring road/i },
  { context: 'REYKJAVIK', pattern: /雷克雅未克|首都|reykjavik/i },
  { context: 'SNOWFELL_PENINSULA', pattern: /斯奈山|snæfellsnes|snaefellsnes/i },
];

export function compileAttractionExploreIntent(query: string): AttractionExploreCompiledIntent {
  const rawQuery = query.trim();
  const text = rawQuery.toLowerCase();
  const matchedPhrases: string[] = [];

  const themes = THEME_PATTERNS.filter(({ pattern }) => pattern.test(rawQuery)).map((t) => t.themeId);
  const suitableFor = SUITABILITY_PATTERNS.filter(({ pattern }) => pattern.test(rawQuery)).map((s) => s.id);

  let mobilityRequirement: ExploreMobilityRequirement | undefined;
  if (/低强度|轻松|老人|轮椅|low intensity|easy/i.test(rawQuery)) {
    mobilityRequirement = 'LOW_INTENSITY';
    matchedPhrases.push('低强度');
  } else if (/高强度|徒步|冒险|挑战/i.test(rawQuery)) {
    mobilityRequirement = 'HIGH';
    matchedPhrases.push('高强度');
  } else if (/中等|适中/i.test(rawQuery)) {
    mobilityRequirement = 'MEDIUM';
  }

  const parkingRequired =
    /停车|停车场|好停|parking|park and ride/i.test(rawQuery) || undefined;
  if (parkingRequired) matchedPhrases.push('需要停车');

  let routeContext: string | undefined;
  for (const route of ROUTE_PATTERNS) {
    if (route.pattern.test(rawQuery)) {
      routeContext = route.context;
      matchedPhrases.push(route.context);
      break;
    }
  }

  let maxDetourMinutes: number | undefined;
  const detourMatch = rawQuery.match(/(?:绕路|绕行|detour).*?(\d+)\s*(?:分钟|min)/i);
  if (detourMatch) {
    maxDetourMinutes = Number(detourMatch[1]);
  } else if (/顺路|附近|along the route|on the way/i.test(rawQuery)) {
    maxDetourMinutes = 25;
    matchedPhrases.push('顺路优先');
  } else if (/不远|近距离/i.test(rawQuery)) {
    maxDetourMinutes = 15;
  }

  let weatherMode: ExploreWeatherMode | undefined;
  if (/雨天|下雨|室内|rain|indoor|all.?weather/i.test(rawQuery)) {
    weatherMode = /雨天|下雨|rain/i.test(rawQuery) ? 'RAINY_DAY' : 'ALL_WEATHER';
    matchedPhrases.push(weatherMode === 'RAINY_DAY' ? '雨天友好' : '全天气');
  } else if (/户外|outdoor/i.test(rawQuery)) {
    weatherMode = 'OUTDOOR';
  }

  const excludeVisited = /没去|未去|还没|exclude|not visited/i.test(rawQuery) ? true : undefined;

  const keywords = rawQuery
    .split(/[\s,，、；;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .slice(0, 8);

  if (themes.length === 0 && suitableFor.length === 0 && keywords.length > 0) {
    for (const theme of ATTRACTION_EXPLORE_THEMES) {
      if (keywords.some((k) => theme.label.includes(k) || theme.id.includes(k))) {
        themes.push(theme.id);
      }
    }
    for (const suit of ATTRACTION_EXPLORE_SUITABILITIES) {
      if (keywords.some((k) => suit.label.includes(k))) {
        suitableFor.push(suit.id);
      }
    }
  }

  return {
    rawQuery,
    themes: [...new Set(themes)],
    suitableFor: [...new Set(suitableFor)],
    mobilityRequirement,
    parkingRequired,
    routeContext,
    maxDetourMinutes,
    weatherMode,
    excludeVisited,
    keywords,
    matchedPhrases,
  };
}

/**
 * 像在搜具体地名（而非「雨天室内/亲子顺路」这类意图句）时，规则结果已够用，不应再让 LLM 扩主题。
 */
export function isAttractionExplorePlaceNameLookup(
  intent: AttractionExploreCompiledIntent,
): boolean {
  if (intent.themes.length > 0 || intent.suitableFor.length > 0) return false;
  if (intent.weatherMode || intent.maxDetourMinutes != null || intent.excludeVisited) {
    return false;
  }
  if (intent.mobilityRequirement || intent.parkingRequired) return false;

  const q = intent.rawQuery.trim();
  if (q.length < 2) return false;

  // 含明确筛选意图词则不是纯地名查询
  if (
    /雨天|下雨|室内|顺路|附近|绕路|第一次|必去|亲子|家庭|情侣|独行|老人|冒险|轻松|摄影|温泉|瀑布|冰川|高地|博物馆/i.test(
      q,
    )
  ) {
    return false;
  }

  return intent.keywords.length >= 1 || intent.routeContext != null;
}

export function mergeCompiledIntentWithFilters(input: {
  compiled: AttractionExploreCompiledIntent;
  themeIds?: string[];
  suitabilityIds?: string[];
}): { themeIds: string[]; suitabilityIds: string[]; viewTab?: 'along_route' | 'recommended' } {
  const themeIds = [...new Set([...(input.themeIds ?? []), ...input.compiled.themes])];
  const suitabilityIds = [
    ...new Set([...(input.suitabilityIds ?? []), ...input.compiled.suitableFor]),
  ];
  const viewTab =
    input.compiled.routeContext || input.compiled.maxDetourMinutes != null
      ? 'along_route'
      : undefined;
  return { themeIds, suitabilityIds, viewTab };
}
