/**
 * 冰岛区域 POI slug → 数据库名称检索关键词（用于候选注入 / 排除 / 加权）
 * Phase 1：与 RegionIntent 中 id 对齐
 */
export const ICELAND_POI_SLUG_KEYWORDS: Record<string, string[]> = {
  thingvellir: ['辛格维利尔', 'Thingvellir', 'Þingvellir', 'Silfra'],
  /** Phase 3.2：贴近库名/攻略常用写法，提升 merge 关键词命中与 DB fetch */
  geysir: [
    'Geysir',
    '盖歇尔',
    '间歇泉',
    'Haukadalur',
    'Strokkur',
    'Great Geysir',
    'Geysir Geothermal',
    'Geysir geothermal area',
  ],
  gullfoss: ['Gullfoss', '黄金瀑布', 'Gullfoss Waterfall', 'Golden Falls', '古佛斯瀑布', '古佛斯'],
  kerid_crater: ['Kerið', 'Kerið Crater', '凯里斯'],
  secret_lagoon: ['Secret Lagoon', '秘密温泉', 'Gamla Laugin'],
  fridheimar: ['Friðheimar', '番茄农场'],
  bruarfoss: ['Brúarfoss', '蓝色秘境瀑布'],
};
