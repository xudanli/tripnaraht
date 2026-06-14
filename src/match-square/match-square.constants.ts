export const MATCH_SQUARE_POST_STATUSES = ['active', 'hidden', 'closed'] as const;
export type MatchSquarePostStatus = (typeof MATCH_SQUARE_POST_STATUSES)[number];

export const MATCH_SQUARE_APPLICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type MatchSquareApplicationStatus = (typeof MATCH_SQUARE_APPLICATION_STATUSES)[number];

export const PLANNING_STYLE_LABELS: Record<string, string> = {
  full_managed: '全托管',
  co_planning: '一起策划',
  casual_play: '一起随便玩',
};

export const PLANNING_STYLE_CAPSULES: Record<string, string> = {
  full_managed: '🛡️ 组队风格：全托管',
  co_planning: '🛡️ 组队风格：一起策划',
  casual_play: '🛡️ 组队风格：一起随便玩',
};

export const INTERACTION_MODE_LABELS: Record<string, string> = {
  deep_learning: '深度共学型',
  easy_companion: '轻松陪伴型',
  independent: '各自独立型',
};

export const MBTI_QUADRANT_LABELS: Record<string, string> = {
  NT: 'NT · 分析型',
  NF: 'NF · 理想型',
  SP: 'SP · 体验型',
  SJ: 'SJ · 守护型',
};

export const FILTER_OPTIONS = {
  personaQuadrants: [
    { id: 'NT', label: 'NT · 分析型' },
    { id: 'NF', label: 'NF · 理想型' },
    { id: 'SP', label: 'SP · 体验型' },
    { id: 'SJ', label: 'SJ · 守护型' },
  ],
  interactionModes: [
    { id: 'deep_learning', label: '深度共学型' },
    { id: 'easy_companion', label: '轻松陪伴型' },
    { id: 'independent', label: '各自独立型' },
  ],
  teamworkStyles: [
    {
      id: 'full_managed',
      label: '全托管',
      boundary: '队长主导行程与决策',
      contractCapsule: PLANNING_STYLE_CAPSULES.full_managed,
    },
    {
      id: 'co_planning',
      label: '一起策划',
      boundary: '共同讨论关键节点',
      contractCapsule: PLANNING_STYLE_CAPSULES.co_planning,
    },
    {
      id: 'casual_play',
      label: '一起随便玩',
      boundary: '低约束、即兴同行',
      contractCapsule: PLANNING_STYLE_CAPSULES.casual_play,
    },
  ],
  destinationRegions: [
    {
      id: 'northwest',
      label: '西北',
      hint: '新疆 · 青海 · 甘肃',
      subScopes: [
        { id: 'xinjiang', label: '新疆', scope: '新疆' },
        { id: 'qinghai', label: '青海', scope: '青海' },
      ],
    },
    {
      id: 'southwest',
      label: '西南',
      hint: '云南 · 四川 · 西藏',
      subScopes: [
        { id: 'yunnan', label: '云南', scope: '云南' },
        { id: 'sichuan', label: '四川', scope: '四川' },
      ],
    },
  ],
};
