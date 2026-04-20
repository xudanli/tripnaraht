/**
 * Phase 3：黄金圈锚点检索画像 — 用于 query augmentation 与 slug→实体名匹配
 * 不替代 ICELAND_POI_SLUG_KEYWORDS，与之互补（更多英文/景区全名）
 */

export type AnchorRetrievalEntry = {
  slug: string;
  aliases: string[];
  /** 在 name/nameEN 中优先匹配的子串（小写比较） */
  dbNamePatterns?: string[];
  regionTags?: string[];
};

export interface AnchorRetrievalProfile {
  regionId: string;
  requiredAnchors: AnchorRetrievalEntry[];
}

export const GOLDEN_CIRCLE_RETRIEVAL_PROFILE: AnchorRetrievalProfile = {
  regionId: 'golden_circle',
  requiredAnchors: [
    {
      slug: 'thingvellir',
      aliases: [
        'thingvellir',
        'þingvellir',
        'pingvellir',
        'thingvellir national park',
        '辛格维利尔',
      ],
      /** Phase 3.1：禁止仅凭「国家公园」等泛化词命中（避免斯奈山/瓦特纳等误标） */
      dbNamePatterns: ['thingvellir', 'þingvellir', 'pingvellir', '辛格维利尔'],
      regionTags: ['golden_circle'],
    },
    {
      slug: 'geysir',
      aliases: [
        'geysir',
        'great geysir',
        'strokkur',
        'haukadalur',
        'geysir geothermal',
        'geysir geothermal area',
        '盖歇尔',
        '间歇泉',
        '大间歇泉',
      ],
      dbNamePatterns: [
        'geysir',
        'great geysir',
        'strokkur',
        'haukadalur',
        'geysir geothermal',
        '盖歇尔',
        '间歇泉',
      ],
      regionTags: ['golden_circle'],
    },
    {
      slug: 'gullfoss',
      aliases: [
        'gullfoss',
        'golden falls',
        'gullfoss waterfall',
        '黄金瀑布',
        '古佛斯瀑布',
        '古佛斯',
      ],
      dbNamePatterns: ['gullfoss', 'golden falls', 'gullfoss waterfall', '黄金瀑布', '古佛斯'],
      regionTags: ['golden_circle'],
    },
  ],
};

const PROFILES: Record<string, AnchorRetrievalProfile> = {
  golden_circle: GOLDEN_CIRCLE_RETRIEVAL_PROFILE,
};

export function getAnchorRetrievalProfile(regionId?: string): AnchorRetrievalProfile | undefined {
  if (!regionId) return undefined;
  return PROFILES[regionId.trim().toLowerCase()];
}

/**
 * Phase 3.2：第四路 poi.search 专补 Geysir / Gullfoss（与全圈 query 解耦，优先召回两颗短板锚点）。
 */
export const GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY =
  'Iceland Golden Circle Geysir Gullfoss Haukadalur Strokkur Great Geysir Geysir geothermal Gullfoss waterfall Golden Falls 黄金瀑布 盖歇尔 间歇泉 古佛斯瀑布';
