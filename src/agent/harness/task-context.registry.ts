/**
 * Fast Query Context Registry（Sprint 1 / T3）。
 * Context 按任务申请，不是每轮默认全量注入。
 */

export type FastQueryContextKey =
  | 'TRIP_QUERY_LODGING'
  | 'TRIP_QUERY_TODAY'
  | 'TRIP_QUERY_NEXT'
  | 'TRIP_QUERY_PENDING'
  | 'TRIP_QUERY_RISK'
  | 'TRIP_QUERY_READINESS'
  | 'TRIP_QUERY_GENERIC';

export type TaskContextRegistryEntry = {
  key: FastQueryContextKey;
  labelZh: string;
  required: string[];
  optional?: string[];
  freshness?: Record<string, string>;
  /** 用于从用户话术匹配 registry key */
  match: (semanticMessage: string) => boolean;
};

export const TASK_CONTEXT_REGISTRY: readonly TaskContextRegistryEntry[] = [
  {
    key: 'TRIP_QUERY_LODGING',
    labelZh: '住宿缺口/住哪里',
    required: ['DAY_LIST', 'ACCOMMODATION_ANCHORS'],
    optional: ['TRIP_DATE_RANGE'],
    match: (m) =>
      /哪一天没住宿|哪天没住宿|哪一天没有住宿|哪天没有住宿|还缺住宿|缺住宿|没安排住宿|有没有订酒店|明天住哪里|今晚住哪|住哪/.test(
        m,
      ) || /(?:住宿|过夜).{0,12}(?:缺口|缺失|没有|没安排)/.test(m),
  },
  {
    key: 'TRIP_QUERY_TODAY',
    labelZh: '今天安排',
    required: ['CURRENT_DAY', 'TIMELINE'],
    optional: ['CURRENT_POSITION'],
    match: (m) => /今天怎么安排|今日行程|今天行程|今天做什么|今天去哪/.test(m),
  },
  {
    key: 'TRIP_QUERY_NEXT',
    labelZh: '下一站',
    required: ['CURRENT_DAY', 'TIMELINE', 'CURRENT_POSITION', 'NEXT_ACTIVITY'],
    match: (m) => /下一站|下一个景点|接下来去哪|下一程/.test(m),
  },
  {
    key: 'TRIP_QUERY_PENDING',
    labelZh: '待确认',
    required: ['UNCONFIRMED_ITEMS', 'OPEN_DECISIONS'],
    match: (m) => /还有哪些没确认|哪些没确认|待确认|未确认/.test(m),
  },
  {
    key: 'TRIP_QUERY_RISK',
    labelZh: '当前风险',
    required: ['ACTIVE_RISKS', 'GATE_SUMMARY'],
    optional: ['WEATHER', 'ROAD_STATE'],
    freshness: { WEATHER: 'LIVE', ROAD_STATE: 'LIVE' },
    match: (m) => /当前风险|有什么风险|为什么有风险|风险盘点/.test(m),
  },
  {
    key: 'TRIP_QUERY_READINESS',
    labelZh: '准备度',
    required: ['READINESS_SCORE', 'GAP_LIST'],
    optional: ['ACCOMMODATION_ANCHORS'],
    match: (m) =>
      /准备度|合理不合理|是否合理|全面分析|行程体检|有没有订酒店|用餐安排/.test(m),
  },
  {
    key: 'TRIP_QUERY_GENERIC',
    labelZh: '通用行程问答',
    required: ['DAY_LIST'],
    optional: ['TIMELINE', 'ACCOMMODATION_ANCHORS'],
    match: () => true,
  },
];

export function resolveFastQueryContextEntry(semanticMessage: string): TaskContextRegistryEntry {
  const msg = String(semanticMessage ?? '').trim();
  for (const entry of TASK_CONTEXT_REGISTRY) {
    if (entry.key === 'TRIP_QUERY_GENERIC') continue;
    if (entry.match(msg)) return entry;
  }
  return TASK_CONTEXT_REGISTRY.find((e) => e.key === 'TRIP_QUERY_GENERIC')!;
}
