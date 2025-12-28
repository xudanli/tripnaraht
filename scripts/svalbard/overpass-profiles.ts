// scripts/svalbard/overpass-profiles.ts
/**
 * 斯瓦尔巴 Overpass 查询 Profile 定义
 * 
 * 按场景组合查询，避免一次 query 太大
 * 中心点：Longyearbyen (78.223, 15.626)
 */

export interface OverpassProfile {
  name: string;
  description: string;
  query: string;
}

/**
 * Profile A: Ports & Marine Access（码头/港区/出海相关）
 */
export const PROFILE_A_PORTS_MARINE: OverpassProfile = {
  name: 'Ports & Marine Access',
  description: '码头/渡轮/栈桥/港区/出海相关',
  query: `[out:json][timeout:60];
(
  nwr["amenity"="ferry_terminal"](around:{R},{LAT},{LNG});
  nwr["man_made"="pier"](around:{R},{LAT},{LNG});
  nwr["leisure"="marina"](around:{R},{LAT},{LNG});
  nwr["landuse"="harbour"](around:{R},{LAT},{LNG});
  nwr["waterway"="dock"](around:{R},{LAT},{LNG});
  nwr["water"="harbour"](around:{R},{LAT},{LNG});
  nwr["harbour"](around:{R},{LAT},{LNG});
  nwr["office"="tourism"](around:{R},{LAT},{LNG});
  nwr["tourism"="agency"](around:{R},{LAT},{LNG});
  nwr["amenity"="boat_rental"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile B: Trailheads & Information（徒步入口/信息点/观景点）
 */
export const PROFILE_B_TRAILHEADS_INFO: OverpassProfile = {
  name: 'Trailheads & Information',
  description: '徒步入口/信息点/观景点',
  query: `[out:json][timeout:60];
(
  nwr["highway"="trailhead"](around:{R},{LAT},{LNG});
  nwr["tourism"="information"](around:{R},{LAT},{LNG});
  nwr["tourism"="viewpoint"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile C: Safety & Supply（安全保障点 + 补给）
 */
export const PROFILE_C_SAFETY_SUPPLY: OverpassProfile = {
  name: 'Safety & Supply',
  description: '安全保障点 + 补给（医院/警局/加油站/超市/厕所）',
  query: `[out:json][timeout:60];
(
  nwr["amenity"="hospital"](around:{R},{LAT},{LNG});
  nwr["amenity"="clinic"](around:{R},{LAT},{LNG});
  nwr["amenity"="pharmacy"](around:{R},{LAT},{LNG});
  nwr["amenity"="police"](around:{R},{LAT},{LNG});
  nwr["amenity"="fire_station"](around:{R},{LAT},{LNG});
  nwr["amenity"="fuel"](around:{R},{LAT},{LNG});
  nwr["shop"="supermarket"](around:{R},{LAT},{LNG});
  nwr["shop"="convenience"](around:{R},{LAT},{LNG});
  nwr["amenity"="toilets"](around:{R},{LAT},{LNG});
  nwr["shelter"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile D: Transport Nodes（机场/交通枢纽）
 */
export const PROFILE_D_TRANSPORT: OverpassProfile = {
  name: 'Transport Nodes',
  description: '机场/交通枢纽',
  query: `[out:json][timeout:60];
(
  nwr["aeroway"="aerodrome"](around:{R},{LAT},{LNG});
  nwr["aeroway"="terminal"](around:{R},{LAT},{LNG});
  nwr["amenity"="parking"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile E: Outdoor Equipment & Services（户外装备/租赁/旅行社）
 */
export const PROFILE_E_OUTDOOR_SERVICES: OverpassProfile = {
  name: 'Outdoor Equipment & Services',
  description: '户外装备/租赁/旅行社',
  query: `[out:json][timeout:60];
(
  nwr["shop"="outdoor"](around:{R},{LAT},{LNG});
  nwr["amenity"="boat_rental"](around:{R},{LAT},{LNG});
  nwr["office"="tourism"](around:{R},{LAT},{LNG});
  nwr["tourism"="agency"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * 所有 Profile 列表
 */
export const SVALBARD_OVERPASS_PROFILES: OverpassProfile[] = [
  PROFILE_A_PORTS_MARINE,
  PROFILE_B_TRAILHEADS_INFO,
  PROFILE_C_SAFETY_SUPPLY,
  PROFILE_D_TRANSPORT,
  PROFILE_E_OUTDOOR_SERVICES,
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

/**
 * Longyearbyen 中心点坐标
 */
export const LONGYEARBYEN_CENTER = {
  lat: 78.223,
  lng: 15.626,
};

/**
 * 默认搜索半径（米）
 * 25000m = 25km，覆盖朗伊尔城周边
 */
export const DEFAULT_RADIUS_METERS = 25000;



