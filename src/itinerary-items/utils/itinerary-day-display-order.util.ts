/**
 * 工作台时间轴展示顺序：当天「退房」项固定置顶，其余再按 startTime。
 */

export type ItineraryItemDisplaySortable = {
  startTime?: Date | string | null;
  crossDayInfo?: { isCheckoutItem?: boolean; displayMode?: string };
  _isCheckoutItem?: boolean;
  displaySortIndex?: number;
};

export function isCheckoutDisplayItem(item: ItineraryItemDisplaySortable): boolean {
  if (item._isCheckoutItem === true) return true;
  if (item.crossDayInfo?.isCheckoutItem === true) return true;
  return item.crossDayInfo?.displayMode === 'checkout';
}

export function sortItineraryItemsForDayDisplay<T extends ItineraryItemDisplaySortable>(
  items: T[],
): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aCheckout = isCheckoutDisplayItem(a.item);
      const bCheckout = isCheckoutDisplayItem(b.item);
      if (aCheckout && !bCheckout) return -1;
      if (!aCheckout && bCheckout) return 1;
      const aT = a.item.startTime ? new Date(a.item.startTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bT = b.item.startTime ? new Date(b.item.startTime).getTime() : Number.MAX_SAFE_INTEGER;
      if (aT !== bT) return aT - bT;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function attachDisplaySortIndices<T extends ItineraryItemDisplaySortable>(
  items: T[],
): Array<T & { displaySortIndex: number }> {
  const sorted = sortItineraryItemsForDayDisplay(items);
  return sorted.map((item, index) => ({
    ...item,
    displaySortIndex: index,
  }));
}
