/** Place 展示名 — 中文 UI 默认优先 nameCN */
export type PlaceNameLike = {
  nameCN?: string | null;
  nameEN?: string | null;
};

export function resolvePlaceDisplayName(
  place?: PlaceNameLike | null,
  opts?: { locale?: 'zh' | 'en'; fallback?: string },
): string {
  const fallback = opts?.fallback ?? '行程点';
  if (!place) return fallback;
  const cn = place.nameCN?.trim();
  const en = place.nameEN?.trim();
  if (opts?.locale === 'en') return en || cn || fallback;
  return cn || en || fallback;
}
