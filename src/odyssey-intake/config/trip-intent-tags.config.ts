/** PRD：卡片右下角 CTA 可选即时意向标签（id 与 PATCH tripIntentTag 一致） */
export const ODYSSEY_TRIP_INTENT_TAG_OPTIONS = [
  { id: 'open_to_spontaneity', label: '接受即兴改动' },
  { id: 'budget_mode', label: '穷游模式' },
  { id: 'comfort_priority', label: '舒适度优先' },
  { id: 'photo_hunter', label: '摄影打卡模式' },
  { id: 'slow_pace', label: '慢节奏深度游' },
  { id: 'social_on', label: '愿意多社交' },
  { id: 'solo_recharge', label: '需要独处回血' },
  { id: 'early_bird', label: '早起特种兵' },
] as const;

export type OdysseyTripIntentTagId = (typeof ODYSSEY_TRIP_INTENT_TAG_OPTIONS)[number]['id'];
