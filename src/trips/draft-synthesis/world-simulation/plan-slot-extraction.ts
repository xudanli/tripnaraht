import type { DraftDay } from '../../dto/trip-draft.dto';

export const PLAN_SLOT_ORDER = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;

export interface ExtractedPlanSlot {
  day: number;
  slot: string;
  placeId: number;
  riskTags?: string[];
}

/**
 * 从草案日表抽取用于影响分析的槽位清单。
 */
export function extractPlanSlotsFromDraftDays(days: DraftDay[]): ExtractedPlanSlot[] {
  const out: ExtractedPlanSlot[] = [];
  for (const d of days) {
    const slots = d.slots || {};
    for (const slot of PLAN_SLOT_ORDER) {
      const item = slots[slot] as
        | { placeId?: number; evidence?: { riskTags?: string[] } }
        | undefined;
      if (!item?.placeId) continue;
      out.push({
        day: d.day,
        slot,
        placeId: item.placeId,
        riskTags: item.evidence?.riskTags,
      });
    }
  }
  return out;
}
