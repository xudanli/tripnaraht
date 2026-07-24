/**
 * 冰岛 Canonical POI catalog — CPRE P0 seed SSOT
 * 合并 poi-access-capacity / planning-policy 现有别名源
 */

import {
  ICELAND_A_TIER_POI_SLUGS,
  ICELAND_POI_SLUG_RESOLVERS,
} from '../../poi-access-capacity/fixtures/iceland-poi-registry';
import { ICELAND_B_TIER_POI_SLUGS } from '../../poi-access-capacity/fixtures/is-b-tier.rules';
import { ICELAND_C_TIER_POI_SLUGS } from '../../poi-access-capacity/fixtures/is-c-tier.crowding-profiles';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../planning-policy/regions/iceland-poi-slugs';
import { GOLDEN_CIRCLE_RETRIEVAL_PROFILE } from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import type { CanonicalPOI } from '../types/canonical-poi.types';

const SHORT_SLUG_TO_POI_ID: Record<string, string> = {
  thingvellir: ICELAND_C_TIER_POI_SLUGS.THINGVELLIR,
  geysir: ICELAND_C_TIER_POI_SLUGS.GEYSIR,
  gullfoss: ICELAND_C_TIER_POI_SLUGS.GULLFOSS,
  kerid_crater: 'is.kerid_crater',
  secret_lagoon: 'is.secret_lagoon',
  fridheimar: 'is.fridheimar',
  bruarfoss: 'is.bruarfoss',
  askja: 'is.askja',
  myvatn: 'is.myvatn',
  godafoss: 'is.godafoss',
  krafla: 'is.krafla',
  fjadrargljufur: 'is.fjadrargljufur',
  husavik: 'is.husavik',
  silfra: 'is.silfra',
};

const CANONICAL_NAMES: Record<string, string> = {
  [ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR]: 'Landmannalaugar',
  [ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON]: 'Blue Lagoon',
  [ICELAND_A_TIER_POI_SLUGS.SKY_LAGOON]: 'Sky Lagoon',
  [ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL]: 'Skaftafell',
  [ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY]: 'Dyrhólaey',
  [ICELAND_B_TIER_POI_SLUGS.REYNISFJARA]: 'Reynisfjara',
  [ICELAND_B_TIER_POI_SLUGS.DETTIFOSS]: 'Dettifoss',
  [ICELAND_C_TIER_POI_SLUGS.GULLFOSS]: 'Gullfoss',
  [ICELAND_C_TIER_POI_SLUGS.GEYSIR]: 'Geysir Geothermal Area',
  [ICELAND_C_TIER_POI_SLUGS.SELJALANDSFOSS]: 'Seljalandsfoss',
  [ICELAND_C_TIER_POI_SLUGS.SKOGAFOSS]: 'Skógafoss',
  [ICELAND_C_TIER_POI_SLUGS.JOKULSARLON]: 'Jökulsárlón',
  [ICELAND_C_TIER_POI_SLUGS.THINGVELLIR]: 'Þingvellir National Park',
  'is.kerid_crater': 'Kerið Crater',
  'is.secret_lagoon': 'Secret Lagoon',
  'is.fridheimar': 'Friðheimar',
  'is.bruarfoss': 'Brúarfoss',
  'is.askja': 'Askja Caldera',
  'is.myvatn': 'Mývatn',
  'is.godafoss': 'Goðafoss',
  'is.krafla': 'Krafla',
  'is.fjadrargljufur': 'Fjaðrárgljúfur',
  'is.husavik': 'Húsavík',
  'is.silfra': 'Silfra',
};

const EXTRA_ALIASES: Record<string, string[]> = {
  [ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON]: ['Bláa Lónið', 'blaa lonid'],
  [ICELAND_B_TIER_POI_SLUGS.REYNISFJARA]: [
    'Black Sand Beach',
    'black sand beach',
    'Reynisdrangar',
  ],
  [ICELAND_C_TIER_POI_SLUGS.GEYSIR]: ['Great Geysir', 'Strokkur', 'Haukadalur'],
  [ICELAND_C_TIER_POI_SLUGS.THINGVELLIR]: ['Thingvellir National Park', 'Pingvellir'],
  [ICELAND_C_TIER_POI_SLUGS.JOKULSARLON]: ['Glacier Lagoon', 'Diamond Beach', '杰古沙龙', '杰古沙龙冰河湖'],
  'is.askja': ['Askja', '阿斯恰', 'Askja 高地'],
  'is.myvatn': ['Lake Myvatn', '米湖', 'Myvatn', 'Mývatn Nature Baths'],
  'is.godafoss': ['Goðafoss', 'Goddafoss', '神之瀑布', '众神瀑布'],
  'is.krafla': ['Krafla', '克拉布拉火山', 'Viti crater'],
  'is.fjadrargljufur': ['Fjaðrárgljúfur', 'Fjadrargljufur', '羽毛峡谷', 'Fjaðrárgljúfur Canyon'],
  'is.husavik': ['Húsavík', 'Husavik', '胡萨维克', '观鲸'],
  'is.silfra': ['Silfra', '丝浮拉', 'Silfra Fissure'],
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function aliasesFromRegexResolver(slug: string): string[] {
  const entry = ICELAND_POI_SLUG_RESOLVERS.find((r) => r.slug === slug);
  if (!entry) return [];
  return entry.patterns.flatMap((p) => {
    const src = p.source;
    const inner = src.replace(/^\(\?:|\)$/g, '').replace(/\\b/g, '');
    return inner.split('|').map((s) => s.replace(/\\[a-z]/gi, '').trim());
  });
}

function aliasesFromPlanningKeywords(poiId: string): string[] {
  const short = poiId.replace(/^is\./, '');
  return ICELAND_POI_SLUG_KEYWORDS[short] ?? [];
}

function aliasesFromGoldenCircle(poiId: string): string[] {
  const short = poiId.replace(/^is\./, '');
  const anchor = GOLDEN_CIRCLE_RETRIEVAL_PROFILE.requiredAnchors.find((a) => a.slug === short);
  if (!anchor) return [];
  return [...anchor.aliases, ...(anchor.dbNamePatterns ?? [])];
}

function buildCatalogEntry(poiId: string): CanonicalPOI {
  const canonicalName = CANONICAL_NAMES[poiId] ?? poiId.replace(/^is\./, '').replace(/_/g, ' ');
  const aliases = uniqueStrings([
    ...aliasesFromRegexResolver(poiId),
    ...aliasesFromPlanningKeywords(poiId),
    ...aliasesFromGoldenCircle(poiId),
    ...(EXTRA_ALIASES[poiId] ?? []),
  ]).filter((a) => a.toLowerCase() !== canonicalName.toLowerCase());

  return {
    poiId,
    canonicalName,
    aliases,
    country: 'IS',
    status: 'ACTIVE',
    popularity: poiId.startsWith('is.') ? 80 : 50,
  };
}

const ALL_ICELAND_POI_IDS = uniqueStrings([
  ...Object.values(ICELAND_A_TIER_POI_SLUGS),
  ...Object.values(ICELAND_B_TIER_POI_SLUGS),
  ...Object.values(ICELAND_C_TIER_POI_SLUGS),
  ...Object.values(SHORT_SLUG_TO_POI_ID),
]);

export const ICELAND_CANONICAL_POI_CATALOG: CanonicalPOI[] = ALL_ICELAND_POI_IDS.map(
  buildCatalogEntry,
);

export function getIcelandCanonicalPoiById(poiId: string): CanonicalPOI | undefined {
  return ICELAND_CANONICAL_POI_CATALOG.find((p) => p.poiId === poiId);
}

/** Flat alias rows for DB seed */
export function buildIcelandPoiAliasSeedRows(): Array<{
  poiId: string;
  alias: string;
  locale?: string;
  source: string;
}> {
  const rows: Array<{ poiId: string; alias: string; locale?: string; source: string }> = [];

  for (const poi of ICELAND_CANONICAL_POI_CATALOG) {
    rows.push({ poiId: poi.poiId, alias: poi.canonicalName, source: 'SYSTEM' });
    for (const alias of poi.aliases) {
      const locale = /[\u4e00-\u9fff]/.test(alias) ? 'zh' : undefined;
      rows.push({ poiId: poi.poiId, alias, locale, source: 'SYSTEM' });
    }
  }

  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.poiId}::${r.alias.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
