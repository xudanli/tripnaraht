/**
 * 冰岛常见餐饮目录（餐厅 live / 聊天卡片回落）。
 * Google Places 不可用时，按行程区域给出可跳转参考卡。
 */

export type IcelandDiningRegionId =
  | 'reykjavik'
  | 'golden_circle'
  | 'selfoss'
  | 'south_coast'
  | 'vik'
  | 'glacier_lagoon';

export type IcelandDiningCatalogEntry = {
  id: string;
  regionIds: IcelandDiningRegionId[];
  match: RegExp;
  nameZh: string;
  nameEn: string;
  areaZh: string;
  url: string;
  mapsUrl?: string;
  priceHintZh?: string;
  cuisineZh?: string;
  reasonZh: string;
  reservationHintZh: string;
};

export const ICELAND_DINING_CATALOG: IcelandDiningCatalogEntry[] = [
  {
    id: 'fridheimar',
    regionIds: ['golden_circle', 'selfoss'],
    match: /Fri[ðd]heimar|番茄|温室/i,
    nameZh: 'Friðheimar 番茄温室餐厅',
    nameEn: 'Friðheimar',
    areaZh: '黄金圈 · 雷克霍特附近',
    url: 'https://fridheimar.is/',
    priceHintZh: '中高',
    cuisineZh: '番茄汤 / 温室简餐',
    reasonZh: '黄金圈经典午餐点，温室里吃番茄汤，顺路盖歇尔',
    reservationHintZh: '旺季建议提前订午餐时段',
  },
  {
    id: 'geysir_glacier',
    regionIds: ['golden_circle'],
    match: /Geysir|盖歇尔.*餐/i,
    nameZh: '盖歇尔景区餐厅',
    nameEn: 'Geysir Restaurant / Café',
    areaZh: '盖歇尔间歇泉',
    url: 'https://www.geysirglacier.com/',
    priceHintZh: '中高',
    cuisineZh: '景区简餐',
    reasonZh: '间歇泉旁就餐，适合赶路午餐',
    reservationHintZh: '一般无需预订，旺季错峰',
  },
  {
    id: 'tryggvaskali',
    regionIds: ['selfoss', 'golden_circle'],
    match: /Tryggvaskáli|Tryggvaskali|塞尔福斯/i,
    nameZh: 'Tryggvaskáli',
    nameEn: 'Tryggvaskáli',
    areaZh: '塞尔福斯镇',
    url: 'https://www.tryggvaskali.is/',
    priceHintZh: '中高',
    cuisineZh: '现代冰岛菜 / 海鲜',
    reasonZh: '黄金圈日晚住塞尔福斯时的稳妥晚餐选择',
    reservationHintZh: '晚餐旺季建议提前订位',
  },
  {
    id: 'restaurant_selfoss',
    regionIds: ['selfoss', 'golden_circle'],
    match: /Selfoss|塞尔福斯/i,
    nameZh: '塞尔福斯镇餐饮区',
    nameEn: 'Selfoss dining',
    areaZh: '塞尔福斯',
    url: 'https://www.google.com/maps/search/restaurants+Selfoss+Iceland',
    mapsUrl: 'https://www.google.com/maps/search/restaurants+Selfoss+Iceland',
    priceHintZh: '中档',
    cuisineZh: '小镇餐厅 / 快餐',
    reasonZh: '黄金圈日回程补给与晚餐选择相对集中',
    reservationHintZh: '多数餐厅无需预订，热门店晚餐可电话确认',
  },
  {
    id: 'sudurvik',
    regionIds: ['vik', 'south_coast'],
    match: /Súður|Sudur|维克/i,
    nameZh: '维克镇餐厅（参考）',
    nameEn: 'Vík dining',
    areaZh: '维克',
    url: 'https://www.google.com/maps/search/restaurants+Vik+Iceland',
    mapsUrl: 'https://www.google.com/maps/search/restaurants+Vik+Iceland',
    priceHintZh: '中高',
    cuisineZh: '海鲜 / 简餐',
    reasonZh: '南岸过夜点，晚餐选择有限需错峰',
    reservationHintZh: '8 月晚餐时段可能排队，建议当天下午确认',
  },
  {
    id: 'hofn_humarhofnin',
    regionIds: ['glacier_lagoon'],
    match: /Humarh[oö]fnin|霍芬|龙虾/i,
    nameZh: '霍芬龙虾餐厅（参考）',
    nameEn: 'Humarhöfnin / Höfn lobster',
    areaZh: '霍芬',
    url: 'https://www.google.com/maps/search/lobster+restaurant+Hofn+Iceland',
    priceHintZh: '高',
    cuisineZh: '冰岛龙虾',
    reasonZh: '冰河湖日东行时的特色晚餐锚点',
    reservationHintZh: '龙虾馆旺季建议提前订',
  },
];

export function inferDiningRegionsFromText(text: string): IcelandDiningRegionId[] {
  const t = String(text ?? '');
  const out = new Set<IcelandDiningRegionId>();
  if (/雷克雅|Reykjav/i.test(t)) out.add('reykjavik');
  if (/黄金圈|盖歇尔|Geysir|黄金瀑布|Gullfoss|辛格维|Thingvellir|间歇泉/i.test(t)) {
    out.add('golden_circle');
    out.add('selfoss');
  }
  if (/塞尔福斯|Selfoss/i.test(t)) out.add('selfoss');
  if (/维克|V[ií]k|南岸|斯科加|塞里雅兰/i.test(t)) {
    out.add('vik');
    out.add('south_coast');
  }
  if (/冰河湖|杰古沙龙|霍芬|Höfn|Hofn|钻石沙滩/i.test(t)) out.add('glacier_lagoon');
  return [...out];
}

export function matchDiningCatalogEntries(
  query: string,
  regions?: IcelandDiningRegionId[],
  limit = 4,
): IcelandDiningCatalogEntry[] {
  const q = String(query ?? '').trim();
  const regionSet = new Set(regions ?? []);
  let pool = ICELAND_DINING_CATALOG;
  if (regionSet.size) {
    pool = ICELAND_DINING_CATALOG.filter((e) => e.regionIds.some((r) => regionSet.has(r)));
  }
  const named = pool.filter((e) => e.match.test(q));
  const base = named.length ? named : pool;
  return base.slice(0, limit);
}
