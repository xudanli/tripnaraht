/**
 * 冰岛 POI Access & Capacity — 统一注册表（A/B/C 级）
 */

import { ICELAND_A_TIER_ACCESS_RULES, ICELAND_A_TIER_POI_SLUGS } from './is-a-tier.rules';
import { ICELAND_B_TIER_ACCESS_RULES, ICELAND_B_TIER_POI_SLUGS } from './is-b-tier.rules';
import { ICELAND_C_TIER_POI_SLUGS } from './is-c-tier.crowding-profiles';
import { ICELAND_THINGVELLIR_PARKING_FEE_RULE } from './is-thingvellir.rules';
import type { PoiAccessRule } from '../interfaces/poi-access-capacity.interface';

export { ICELAND_A_TIER_POI_SLUGS, ICELAND_B_TIER_POI_SLUGS, ICELAND_C_TIER_POI_SLUGS };

/** 全量 slug 解析（itinerary verify / 名称匹配） */
export const ICELAND_POI_SLUG_RESOLVERS: Array<{
  slug: string;
  patterns: RegExp[];
}> = [
  { slug: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR, patterns: [/landmannalaugar|兰德曼纳劳卡|高地.*温泉/i] },
  { slug: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON, patterns: [/blue lagoon|蓝湖/i] },
  { slug: ICELAND_A_TIER_POI_SLUGS.SKY_LAGOON, patterns: [/sky lagoon|天空之湖|天空 lagoon/i] },
  { slug: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL, patterns: [/skaftafell|斯卡夫塔/i] },
  { slug: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY, patterns: [/dyrh[oó]laey|迪霍拉/i] },
  { slug: ICELAND_B_TIER_POI_SLUGS.REYNISFJARA, patterns: [/reynisfjara|黑沙滩|black sand/i] },
  { slug: ICELAND_B_TIER_POI_SLUGS.DETTIFOSS, patterns: [/dettifoss|黛提瀑布/i] },
  { slug: ICELAND_C_TIER_POI_SLUGS.GULLFOSS, patterns: [/gullfoss|黄金瀑布/i] },
  { slug: ICELAND_C_TIER_POI_SLUGS.GEYSIR, patterns: [/geysir|间歇泉/i] },
  { slug: ICELAND_C_TIER_POI_SLUGS.SELJALANDSFOSS, patterns: [/seljalandsfoss|塞里雅兰/i] },
  { slug: ICELAND_C_TIER_POI_SLUGS.SKOGAFOSS, patterns: [/sk[oó]gafoss|斯科加/i] },
  { slug: ICELAND_C_TIER_POI_SLUGS.JOKULSARLON, patterns: [/j[oö]kuls[aá]rl[oó]n|冰河湖/i] },
  {
    slug: ICELAND_C_TIER_POI_SLUGS.THINGVELLIR,
    patterns: [/thingvellir|þingvellir|辛格维利尔/i],
  },
];

export const ICELAND_ALL_ACCESS_RULES: PoiAccessRule[] = [
  ...ICELAND_A_TIER_ACCESS_RULES,
  ...ICELAND_B_TIER_ACCESS_RULES,
  ICELAND_THINGVELLIR_PARKING_FEE_RULE,
];

export function getBuiltinRulesForPoiSlugs(poiSlugs: string[]): PoiAccessRule[] {
  const set = new Set(poiSlugs);
  return ICELAND_ALL_ACCESS_RULES.filter((r) => set.has(r.poiId));
}

export function isIcelandCrowdingProfilePoi(poiSlug: string): boolean {
  return Object.values(ICELAND_C_TIER_POI_SLUGS).includes(
    poiSlug as (typeof ICELAND_C_TIER_POI_SLUGS)[keyof typeof ICELAND_C_TIER_POI_SLUGS],
  );
}
