import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import type {
  MicroPlanScheduleSlot,
  MicroPlanSlotType,
} from '../types/contextual-recommendations.types';

export type CommitSlotDraft = {
  type: ItemType;
  startTime: string;
  endTime: string;
  note: string;
  placeName: string;
  placeId?: number;
  productId?: string;
  slotType: MicroPlanSlotType;
};

const PRODUCT_NAME_HINTS: Record<string, string[]> = {
  poi_sun_voyager: ['Sun Voyager', '太阳航海者', 'Sólfar', 'Solfar'],
  poi_harpa_waterfront: ['Harpa', '哈帕', 'Harpa Concert Hall'],
};

/** Slots that should not become itinerary rows on commit. */
const SKIP_SLOT_TYPES = new Set<MicroPlanSlotType>(['TRANSFER']);

export function productIdNameHints(productId?: string): string[] {
  if (!productId) return [];
  return PRODUCT_NAME_HINTS[productId] ?? [];
}

export function mapMicroPlanSlotToCommitDraft(slot: MicroPlanScheduleSlot): CommitSlotDraft | null {
  if (SKIP_SLOT_TYPES.has(slot.type)) return null;
  if (!slot.startTime || !slot.endTime) return null;
  if (slot.startTime >= slot.endTime) return null;

  const title = slot.title?.trim() || defaultTitle(slot.type);
  const noteParts = [
    `[情境微规划] ${title}`,
    slot.note?.trim(),
    slot.productId ? `productId=${slot.productId}` : null,
  ].filter(Boolean);

  return {
    type: mapSlotTypeToItemType(slot.type),
    startTime: slot.startTime,
    endTime: slot.endTime,
    note: noteParts.join(' · '),
    placeName: title,
    placeId: slot.placeId,
    productId: slot.productId,
    slotType: slot.type,
  };
}

export function mapMicroPlanScheduleToCommitDrafts(
  schedule: MicroPlanScheduleSlot[],
): CommitSlotDraft[] {
  return schedule
    .map(mapMicroPlanSlotToCommitDraft)
    .filter((row): row is CommitSlotDraft => row != null);
}

function mapSlotTypeToItemType(slotType: MicroPlanSlotType): ItemType {
  switch (slotType) {
    case 'DINING':
      return ItemType.MEAL_FLOATING;
    case 'HOTEL_CHECK_IN':
    case 'REST':
      return ItemType.REST;
    case 'TRANSFER':
      return ItemType.TRANSIT;
    case 'LIGHT_ACTIVITY':
    case 'OTHER':
    default:
      return ItemType.ACTIVITY;
  }
}

function defaultTitle(slotType: MicroPlanSlotType): string {
  switch (slotType) {
    case 'HOTEL_CHECK_IN':
      return '办理入住';
    case 'DINING':
      return '附近晚餐';
    case 'LIGHT_ACTIVITY':
      return '轻松活动';
    case 'REST':
      return '休息';
    case 'TRANSFER':
      return '转移';
    default:
      return '活动';
  }
}
