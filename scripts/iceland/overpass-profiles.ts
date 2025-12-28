// scripts/iceland/overpass-profiles.ts
/**
 * 冰岛 Overpass 查询 Profile 定义
 * 
 * 按场景组合查询，避免一次 query 太大
 * 支持按 region 分区抓取
 */

export interface OverpassProfile {
  name: string;
  description: string;
  query: string;
}

/**
 * Profile A: Transport Nodes（交通节点）
 */
export const PROFILE_A_TRANSPORT: OverpassProfile = {
  name: 'Transport Nodes',
  description: '机场/港口/码头/公交站/停车',
  query: `[out:json][timeout:180];
(
  nwr["aeroway"="aerodrome"](around:{R}, {LAT}, {LNG});
  nwr["aeroway"="terminal"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="ferry_terminal"](around:{R}, {LAT}, {LNG});
  nwr["man_made"="pier"](around:{R}, {LAT}, {LNG});
  nwr["landuse"="harbour"](around:{R}, {LAT}, {LNG});
  nwr["water"="harbour"](around:{R}, {LAT}, {LNG});
  nwr["waterway"="dock"](around:{R}, {LAT}, {LNG});
  nwr["public_transport"="station"](around:{R}, {LAT}, {LNG});
  nwr["highway"="bus_stop"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="parking"](around:{R}, {LAT}, {LNG});
);
out center tags;`
};

/**
 * Profile B: Safety & Supply（安全保障点 + 补给）
 */
export const PROFILE_B_SAFETY_SUPPLY: OverpassProfile = {
  name: 'Safety & Supply',
  description: '安全保障点 + 补给（医院/警局/加油站/超市/厕所）',
  query: `[out:json][timeout:180];
(
  nwr["amenity"="hospital"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="clinic"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="pharmacy"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="police"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="fire_station"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="fuel"](around:{R}, {LAT}, {LNG});
  nwr["shop"="supermarket"](around:{R}, {LAT}, {LNG});
  nwr["shop"="convenience"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="toilets"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="shelter"](around:{R}, {LAT}, {LNG});
);
out center tags;`
};

/**
 * Profile C: Attractions & Nature（玩法入口点）
 */
export const PROFILE_C_ATTRACTIONS: OverpassProfile = {
  name: 'Attractions & Nature',
  description: '瀑布/温泉/地热/冰川/观景/徒步入口',
  query: `[out:json][timeout:180];
(
  nwr["tourism"="attraction"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="viewpoint"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="information"](around:{R}, {LAT}, {LNG});
  nwr["natural"="waterfall"](around:{R}, {LAT}, {LNG});
  nwr["natural"="hot_spring"](around:{R}, {LAT}, {LNG});
  nwr["natural"="geyser"](around:{R}, {LAT}, {LNG});
  nwr["natural"="glacier"](around:{R}, {LAT}, {LNG});
  nwr["natural"="volcano"](around:{R}, {LAT}, {LNG});
  nwr["natural"="beach"](around:{R}, {LAT}, {LNG});
  nwr["highway"="trailhead"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="camp_site"](around:{R}, {LAT}, {LNG});
);
out center tags;`
};

/**
 * Profile D: Spa & Pools（冰岛特色：地热池/泳池）
 */
export const PROFILE_D_SPA_POOLS: OverpassProfile = {
  name: 'Spa & Pools',
  description: '地热池/泳池/SPA（冰岛特色）',
  query: `[out:json][timeout:180];
(
  nwr["leisure"="swimming_pool"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="spa"](around:{R}, {LAT}, {LNG});
);
out center tags;`
};

/**
 * Profile E: Tourism Services（旅游服务）
 */
export const PROFILE_E_TOURISM_SERVICES: OverpassProfile = {
  name: 'Tourism Services',
  description: '旅行社/旅游办公室/租车/住宿',
  query: `[out:json][timeout:180];
(
  nwr["office"="tourism"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="agency"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="car_rental"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="hotel"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="guest_house"](around:{R}, {LAT}, {LNG});
);
out center tags;`
};

/**
 * 所有 Profile 列表
 */
export const ICELAND_OVERPASS_PROFILES: OverpassProfile[] = [
  PROFILE_A_TRANSPORT,
  PROFILE_B_SAFETY_SUPPLY,
  PROFILE_C_ATTRACTIONS,
  PROFILE_D_SPA_POOLS,
  PROFILE_E_TOURISM_SERVICES,
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

