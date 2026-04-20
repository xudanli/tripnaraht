/**
 * Phase 2.3：黄金圈三锚点显式映射（强约束归一，优先于宽松关键词）
 * 与 RegionIntent / requiredAnchorPoiIds 的 slug 对齐
 */
export type GoldenCircleAnchorSlug = 'thingvellir' | 'geysir' | 'gullfoss';

export interface GoldenCircleAnchorMapping {
  canonicalSlug: GoldenCircleAnchorSlug;
  /** 用于分层匹配第三层：别名子串（小写比较时可忽略大小写） */
  aliases: string[];
}

export const GOLDEN_CIRCLE_ANCHOR_MAPPINGS: Record<
  GoldenCircleAnchorSlug,
  GoldenCircleAnchorMapping
> = {
  thingvellir: {
    canonicalSlug: 'thingvellir',
    aliases: [
      'thingvellir',
      'þingvellir',
      'pingvellir',
      '辛格维利尔',
      '辛格韦德利',
      'thingvellir national park',
      'national park at thingvellir',
      'silfra',
    ],
  },
  geysir: {
    canonicalSlug: 'geysir',
    aliases: [
      'geysir',
      'great geysir',
      'strokkur',
      '盖歇尔',
      '间歇泉',
      'geysir area',
    ],
  },
  gullfoss: {
    canonicalSlug: 'gullfoss',
    aliases: [
      'gullfoss',
      'golden falls',
      'golden waterfall',
      '黄金瀑布',
    ],
  },
};

/** 锚点 slug → 归一用别名列表（含 canonical，便于第三层匹配） */
export function aliasesForGoldenCircleAnchor(slug: string): string[] {
  const k = slug.trim().toLowerCase() as GoldenCircleAnchorSlug;
  const m = GOLDEN_CIRCLE_ANCHOR_MAPPINGS[k];
  if (!m) return [slug.trim().toLowerCase()];
  const base = new Set<string>([m.canonicalSlug, ...m.aliases.map((a) => a.toLowerCase())]);
  return [...base];
}
