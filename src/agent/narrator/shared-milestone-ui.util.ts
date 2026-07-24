import type { SharedMilestoneAnchor } from './types/emotional-context.type';
import type { EmotionalContextClientProjection } from './emotional-context-client-projection.util';

/** 前端「共同回忆」轻卡片（纯展示，不含 LLM） */
export type SharedMilestoneUiCard = Readonly<{
  id: string;
  locationName: string;
  headlineZh: string;
  bodyZh: string;
  polarity: SharedMilestoneAnchor['emotionalPolarity'];
}>;

const TOKEN_COPY: Record<string, { headlineZh: string; bodyZh: string }> = {
  EXPERIENCED_HIGH_ANXIETY_IN_WIND: {
    headlineZh: '记得那次强风路段',
    bodyZh: '这次我会优先选更稳妥的动线，并提前同步离线凭证。',
  },
  EXPERIENCED_SIGNAL_BLACKOUT: {
    headlineZh: '记得那次信号中断',
    bodyZh: '已为你预载离线地图与关键节点，减少「失联焦虑」。',
  },
  POSITIVE_TRAVEL_HIGHLIGHT: {
    headlineZh: '上次的高光时刻',
    bodyZh: '就算今天计划被打乱，那次体验仍然是这次旅行的满分底牌。',
  },
  PREFERS_SLOW_PACE: {
    headlineZh: '你的节奏偏好',
    bodyZh: '我会减少非必要打断，把体力留给真正重要的体验。',
  },
};

export function buildSharedMilestoneUiCards(
  milestones: readonly SharedMilestoneAnchor[] | undefined,
): SharedMilestoneUiCard[] {
  if (!milestones?.length) return [];
  return milestones.slice(0, 3).map((m, i) => {
    const copy = TOKEN_COPY[m.legacyPreferenceToken] ?? {
      headlineZh: '我们的共同记忆',
      bodyZh: m.legacyPreferenceToken,
    };
    return {
      id: `${m.pastTripId}:${m.legacyPreferenceToken}:${i}`,
      locationName: m.locationName,
      headlineZh: copy.headlineZh,
      bodyZh: copy.bodyZh,
      polarity: m.emotionalPolarity,
    };
  });
}

export function buildSharedMilestoneUiCardsFromClientProjection(
  ctx: EmotionalContextClientProjection | null | undefined,
): SharedMilestoneUiCard[] {
  return buildSharedMilestoneUiCards(ctx?.sharedMilestones);
}
