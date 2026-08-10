/**
 * 冰岛租车公司 / 比价入口目录（chat 卡片回落）。
 * Booking.com MCP 无结果时，给出可跳转的本地高信任车行与聚合入口。
 */

export type IcelandCarRentalCatalogKind = 'trusted_local' | 'aggregation';

export type IcelandCarRentalCatalogEntry = {
  id: string;
  kind: IcelandCarRentalCatalogKind;
  nameZh: string;
  nameEn: string;
  url: string;
  reasonZh: string;
  tagsZh?: string[];
};

/** 与 iceland.rentalGuidance 本地品牌对齐 */
export const ICELAND_CAR_RENTAL_CATALOG: IcelandCarRentalCatalogEntry[] = [
  {
    id: 'blue',
    kind: 'trusted_local',
    nameZh: 'Blue Car Rental',
    nameEn: 'Blue Car Rental',
    url: 'https://www.bluecarrental.is/',
    reasonZh: '本地高信任默认选项；KEF 取还成熟，砂石险与游客流程相对友好',
    tagsZh: ['trusted_default', 'KEF'],
  },
  {
    id: 'zero',
    kind: 'trusted_local',
    nameZh: 'Zero Car Rental',
    nameEn: 'Zero Car Rental',
    url: 'https://zerocar.is/',
    reasonZh: '偏省心套餐；关注低自赔与道路救援范围（以官网条款为准）',
    tagsZh: ['peace_of_mind'],
  },
  {
    id: 'lotus',
    kind: 'trusted_local',
    nameZh: 'Lotus Car Rental',
    nameEn: 'Lotus Car Rental',
    url: 'https://www.lotuscarrental.is/',
    reasonZh: '口碑型本地行；全险套餐性价比常见，适合预算敏感但仍要覆盖',
    tagsZh: ['budget_sensitive'],
  },
  {
    id: 'lava',
    kind: 'trusted_local',
    nameZh: 'Lava Car Rental',
    nameEn: 'Lava Car Rental',
    url: 'https://lavacarrental.is/',
    reasonZh: '南岸 / 黄金圈经典线常用本地选项',
    tagsZh: ['south_coast'],
  },
  {
    id: 'northbound',
    kind: 'aggregation',
    nameZh: 'Northbound 比价',
    nameEn: 'Northbound Iceland Car Rental',
    url: 'https://www.northbound.is/',
    reasonZh: '聚合比价首入口；适合对比车型与保险组合',
    tagsZh: ['比价'],
  },
  {
    id: 'guide_to_iceland',
    kind: 'aggregation',
    nameZh: 'Guide to Iceland 租车',
    nameEn: 'Guide to Iceland — Car Rental',
    url: 'https://guidetoiceland.is/rent-a-car-in-iceland',
    reasonZh: '本地大流量平台；适合环岛车型与预算区间筛选',
    tagsZh: ['比价'],
  },
];

export function matchCarRentalCatalogEntries(limit = 4): IcelandCarRentalCatalogEntry[] {
  const locals = ICELAND_CAR_RENTAL_CATALOG.filter((e) => e.kind === 'trusted_local');
  const aggs = ICELAND_CAR_RENTAL_CATALOG.filter((e) => e.kind === 'aggregation');
  return [...locals.slice(0, Math.max(2, limit - 1)), ...aggs.slice(0, 1)].slice(0, limit);
}
