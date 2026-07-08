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

export const ATTRACTION_EXPLORE_RECOMMENDATION_GROUPS = [
  { groupId: 'first_time_must_see', title: '第一次来最值得去' },
  { groupId: 'along_route', title: '刚好在路线附近' },
  { groupId: 'rainy_day', title: '下雨天也能玩' },
  { groupId: 'experience_gap', title: '补足行程体验' },
] as const;

export const ATTRACTION_EXPLORE_METADATA_KEY = 'attractionExplore';
