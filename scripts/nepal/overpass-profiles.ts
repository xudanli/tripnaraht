// scripts/nepal/overpass-profiles.ts
/**
 * 尼泊尔 Overpass 查询 Profile 定义
 * 
 * 按场景组合查询，避免一次 query 太大
 */

export interface OverpassProfile {
  name: string;
  description: string;
  query: string;
}

/**
 * Profile A: Trekking Core（徒步入口/营地/小屋/信息点）
 */
export const PROFILE_A_TREKKING_CORE: OverpassProfile = {
  name: 'Trekking Core',
  description: '徒步入口/营地/小屋/信息点',
  query: `[out:json][timeout:180];
(
  nwr["highway"="trailhead"](around:{R},{LAT},{LNG});
  nwr["tourism"="information"](around:{R},{LAT},{LNG});
  nwr["tourism"="viewpoint"](around:{R},{LAT},{LNG});
  nwr["tourism"="camp_site"](around:{R},{LAT},{LNG});
  nwr["tourism"="alpine_hut"](around:{R},{LAT},{LNG});
  nwr["amenity"="shelter"](around:{R},{LAT},{LNG});
  nwr["amenity"="toilets"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile B: Tea House / Lodge（尼泊尔徒步"可执行性"的灵魂）
 */
export const PROFILE_B_TEAHOUSE_LODGE: OverpassProfile = {
  name: 'Tea House / Lodge',
  description: '茶屋/住宿（尼泊尔徒步可执行性的核心）',
  query: `[out:json][timeout:180];
(
  nwr["tourism"="guest_house"](around:{R},{LAT},{LNG});
  nwr["tourism"="hotel"](around:{R},{LAT},{LNG});
  nwr["tourism"="hostel"](around:{R},{LAT},{LNG});
  nwr["name"~"(Tea ?House|Teahouse|Lodge|Guest House)",i](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile C: Safety & Supply（偏远段必备）
 */
export const PROFILE_C_SAFETY_SUPPLY: OverpassProfile = {
  name: 'Safety & Supply',
  description: '安全与补给（偏远段必备）',
  query: `[out:json][timeout:180];
(
  nwr["amenity"="hospital"](around:{R},{LAT},{LNG});
  nwr["amenity"="clinic"](around:{R},{LAT},{LNG});
  nwr["amenity"="pharmacy"](around:{R},{LAT},{LNG});
  nwr["amenity"="police"](around:{R},{LAT},{LNG});
  nwr["amenity"="fuel"](around:{R},{LAT},{LNG});
  nwr["shop"="supermarket"](around:{R},{LAT},{LNG});
  nwr["shop"="convenience"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile D: Transport Nodes（飞/巴士/停车）
 */
export const PROFILE_D_TRANSPORT: OverpassProfile = {
  name: 'Transport Nodes',
  description: '交通节点（机场/巴士站/停车场）',
  query: `[out:json][timeout:180];
(
  nwr["aeroway"="aerodrome"](around:{R},{LAT},{LNG});
  nwr["aeroway"="terminal"](around:{R},{LAT},{LNG});
  nwr["public_transport"="station"](around:{R},{LAT},{LNG});
  nwr["highway"="bus_stop"](around:{R},{LAT},{LNG});
  nwr["amenity"="parking"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * 所有 Profile 列表
 */
export const NEPAL_OVERPASS_PROFILES: OverpassProfile[] = [
  PROFILE_A_TREKKING_CORE,
  PROFILE_B_TEAHOUSE_LODGE,
  PROFILE_C_SAFETY_SUPPLY,
  PROFILE_D_TRANSPORT,
];

/**
 * 替换查询模板中的占位符
 */
export function buildOverpassQuery(
  profile: OverpassProfile,
  lat: number,
  lng: number,
  radiusMeters: number
): string {
  return profile.query
    .replace(/{LAT}/g, lat.toString())
    .replace(/{LNG}/g, lng.toString())
    .replace(/{R}/g, radiusMeters.toString());
}

