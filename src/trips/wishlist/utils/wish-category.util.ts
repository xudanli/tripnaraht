import { WISH_CATEGORIES, type WishCategory } from '../types/trip-wish.types';

const CATEGORY_LABELS_ZH: Record<WishCategory, string> = {
  destination_route: '目的地与路线',
  main_transport: '大交通与接驳',
  accommodation: '住宿方案',
  activities: '活动与体验',
  dining: '餐饮选择',
  local_transport: '当地交通（租车）',
  shopping: '购物',
  insurance_visa: '保险与签证',
};

/** Map legacy category slugs stored before the UI taxonomy update. */
const LEGACY_CATEGORY_MAP: Record<string, WishCategory> = {
  food: 'dining',
  transport: 'local_transport',
  pace_rest: 'destination_route',
  budget: 'accommodation',
  companionship: 'activities',
  other: 'activities',
};

const LEGACY_CATEGORY_LABELS_ZH: Record<string, string> = {
  food: '餐饮选择',
  transport: '当地交通（租车）',
  pace_rest: '目的地与路线',
  budget: '住宿方案',
  companionship: '活动与体验',
  other: '活动与体验',
};

export function isWishCategory(value: string): value is WishCategory {
  return (WISH_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeWishCategory(value: string): WishCategory {
  if (isWishCategory(value)) {
    return value;
  }
  return LEGACY_CATEGORY_MAP[value] ?? 'activities';
}

export function wishCategoryLabel(category: string, locale = 'zh-CN'): string {
  const normalized = normalizeWishCategory(category);
  if (locale.startsWith('zh')) {
    return (
      CATEGORY_LABELS_ZH[normalized] ??
      LEGACY_CATEGORY_LABELS_ZH[category] ??
      category
    );
  }
  return normalized.replace(/_/g, ' ');
}

export function listWishCategoryOptions(locale = 'zh-CN'): Array<{
  value: WishCategory;
  label: string;
}> {
  return WISH_CATEGORIES.map((value) => ({
    value,
    label: wishCategoryLabel(value, locale),
  }));
}

export function clampImportance(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}
