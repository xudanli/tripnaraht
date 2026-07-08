import type { TemplatePoiNameRef } from '../../route-directions/utils/template-poi-place-match.util';

function pushUnique(
  out: TemplatePoiNameRef[],
  seen: Set<string>,
  ref: TemplatePoiNameRef,
) {
  const nameCN = ref.nameCN?.trim();
  const nameEN = ref.nameEN?.trim();
  if (!nameCN && !nameEN) return;
  const key = `${nameCN ?? ''}|${nameEN ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ nameCN, nameEN });
}

/**
 * Expand guide-extracted place names into match candidates (CN/EN + common aliases).
 */
export function expandPlaceNameVariants(
  rawName: string,
  rawNameEn?: string | null,
): TemplatePoiNameRef[] {
  const out: TemplatePoiNameRef[] = [];
  const seen = new Set<string>();
  const cn = rawName.trim();
  const en = rawNameEn?.trim();

  pushUnique(out, seen, { nameCN: cn, nameEN: en ?? cn });
  if (en && en !== cn) {
    pushUnique(out, seen, { nameCN: cn, nameEN: en });
  }

  if (cn.endsWith('大教堂')) {
    pushUnique(out, seen, {
      nameCN: cn.replace(/大教堂$/, '教堂'),
      nameEN: en,
    });
  }

  if (cn.endsWith('教堂') && !cn.endsWith('大教堂')) {
    pushUnique(out, seen, {
      nameCN: `${cn.slice(0, -2)}大教堂`,
      nameEN: en,
    });
  }

  return out;
}
