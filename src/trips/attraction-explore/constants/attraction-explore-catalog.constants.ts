export const ATTRACTION_EXPLORE_THEMES = [
  { id: 'first_time_essentials', label: '第一次必看' },
  { id: 'nature_landscapes', label: '自然风景' },
  { id: 'photography', label: '摄影打卡' },
  { id: 'hot_springs', label: '温泉体验' },
  { id: 'glaciers', label: '冰川冰湖' },
  { id: 'waterfalls', label: '瀑布' },
  { id: 'highlands', label: '高地探险' },
  { id: 'culture_history', label: '人文历史' },
] as const;

export const ATTRACTION_EXPLORE_SUITABILITIES = [
  { id: 'family', label: '亲子家庭' },
  { id: 'couple', label: '情侣' },
  { id: 'solo', label: '独行' },
  { id: 'seniors', label: '长辈友好' },
  { id: 'adventure_seekers', label: '冒险玩家' },
  { id: 'relaxed_pace', label: '轻松节奏' },
] as const;

/** 添加活动页横滑 Chips（iOS SF Symbol 名或约定 key） */
export const ATTRACTION_EXPLORE_QUICK_FILTERS = [
  { id: 'nearby', label: '附近可去', icon: 'location' },
  { id: 'indoor', label: '室内备选', icon: 'house.fill' },
  { id: 'supply', label: '补给便利', icon: 'cart.fill' },
  { id: 'easy', label: '轻松好走', icon: 'figure.walk' },
  { id: 'team', label: '团队匹配', icon: 'person.3.fill' },
] as const;

export const ATTRACTION_EXPLORE_SORT_OPTIONS = [
  { id: 'smart', label: '智能推荐' },
  { id: 'distance', label: '距离最近' },
  { id: 'match', label: '匹配度' },
  { id: 'open_now', label: '正在开放' },
] as const;

export const ATTRACTION_EXPLORE_RECOMMENDATION_GROUPS = [
  { groupId: 'first_time_must_see', title: '第一次来最值得去' },
  { groupId: 'along_route', title: '刚好在路线附近' },
  { groupId: 'rainy_day', title: '下雨天也能玩' },
  { groupId: 'experience_gap', title: '补足行程体验' },
] as const;

export const ATTRACTION_EXPLORE_METADATA_KEY = 'attractionExplore';

export const ATTRACTION_EXPLORE_QUICK_FILTER_IDS = ATTRACTION_EXPLORE_QUICK_FILTERS.map(
  (f) => f.id,
) as readonly string[];

export const ATTRACTION_EXPLORE_SORT_IDS = ATTRACTION_EXPLORE_SORT_OPTIONS.map(
  (s) => s.id,
) as readonly string[];
