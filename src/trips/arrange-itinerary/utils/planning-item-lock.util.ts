import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';

export type PlanningItemLockLevel =
  | 'locked'
  | 'semi_locked'
  | 'must_visit'
  | 'movable';

export interface PlanningItemLockContext {
  itemId: string;
  type: string;
  placeId?: number | null;
  note?: string | null;
  bookingStatus?: string | null;
  bookedAt?: Date | null;
  userLocked?: boolean;
  candidatePriority?: 'must_go' | 'very_interested' | 'alternative' | null;
}

export interface PlanningItemLockView {
  itemId: string;
  lockLevel: PlanningItemLockLevel;
  reason: string;
}

export function classifyPlanningItemLock(
  item: PlanningItemLockContext,
): PlanningItemLockView {
  if (item.userLocked) {
    return { itemId: item.itemId, lockLevel: 'locked', reason: '用户手动锁定' };
  }

  const note = (item.note ?? '').toLowerCase();
  const type = String(item.type).toUpperCase();

  if (type === 'TRANSIT' && /航班|flight|airport|机场|kev|kef/i.test(note)) {
    return { itemId: item.itemId, lockLevel: 'locked', reason: '航班/交通锁定' };
  }

  if (
    item.bookingStatus &&
    ['CONFIRMED', 'BOOKED', 'PAID'].includes(item.bookingStatus.toUpperCase())
  ) {
    return { itemId: item.itemId, lockLevel: 'locked', reason: '已预订活动' };
  }

  if (item.bookedAt) {
    return { itemId: item.itemId, lockLevel: 'semi_locked', reason: '已预订（需确认后调整）' };
  }

  if (item.candidatePriority === 'must_go') {
    return { itemId: item.itemId, lockLevel: 'must_visit', reason: '候选必去' };
  }

  if (type === 'MEAL_ANCHOR' || /酒店|入住|check.?in|accommodation|lodging/i.test(note)) {
    return { itemId: item.itemId, lockLevel: 'semi_locked', reason: '住宿/锚定餐饮' };
  }

  return { itemId: item.itemId, lockLevel: 'movable', reason: '可调整' };
}

export function isPlanningItemImmutable(lockLevel: PlanningItemLockLevel): boolean {
  return lockLevel === 'locked';
}

export function canPlanningAgentMove(lockLevel: PlanningItemLockLevel): boolean {
  return lockLevel === 'movable' || lockLevel === 'must_visit';
}

export function filterMovableItemIds(
  locks: PlanningItemLockView[],
  itemIds: string[],
): string[] {
  const lockMap = new Map(locks.map((l) => [l.itemId, l.lockLevel]));
  return itemIds.filter((id) => {
    const level = lockMap.get(id) ?? 'movable';
    return canPlanningAgentMove(level);
  });
}

export function isRestOrMealType(type: string): boolean {
  const t = type.toUpperCase();
  return (
    t === ItemType.REST ||
    t === ItemType.MEAL_ANCHOR ||
    t === ItemType.MEAL_FLOATING
  );
}
