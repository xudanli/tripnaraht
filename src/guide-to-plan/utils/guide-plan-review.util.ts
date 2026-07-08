import type { GuideItineraryDraft, GuideItineraryDraftItem } from '../services/guide-plan-builder.service';

export interface GuidePlanReviewItem {
  reviewKey: string;
  day: number;
  date?: string;
  name: string;
  type: string;
  placeId?: number | null;
  candidateId?: string;
  source: 'guide' | 'adjusted';
  startTime: string;
  endTime: string;
  /** 默认勾选：攻略原文保留项优先选中 */
  defaultSelected: boolean;
}

export function buildReviewKey(day: number, index: number, item: GuideItineraryDraftItem): string {
  return `${day}:${index}:${item.candidateId ?? item.name}`;
}

export function flattenItineraryForReview(draft: GuideItineraryDraft): GuidePlanReviewItem[] {
  const items: GuidePlanReviewItem[] = [];
  for (const day of draft.days) {
    day.items.forEach((item, index) => {
      items.push({
        reviewKey: buildReviewKey(day.day, index, item),
        day: day.day,
        date: day.date,
        name: item.name,
        type: item.type,
        placeId: item.placeId,
        candidateId: item.candidateId,
        source: item.source,
        startTime: item.startTime,
        endTime: item.endTime,
        defaultSelected: item.source === 'guide',
      });
    });
  }
  return items;
}

export function filterItineraryDraftByReviewKeys(
  draft: GuideItineraryDraft,
  acceptedKeys: Set<string>,
): GuideItineraryDraft {
  const days = draft.days
    .map((day) => {
      const items = day.items.filter((item, index) =>
        acceptedKeys.has(buildReviewKey(day.day, index, item)),
      );
      return {
        ...day,
        items,
        activityCount: items.length,
      };
    })
    .filter((day) => day.items.length > 0);

  return {
    ...draft,
    days,
    totalDays: days.length,
  };
}
