// scripts/new-zealand/overpass-profiles.ts
/**
 * 新西兰 Overpass 查询 Profile 定义
 * 
 * 按场景组合查询，避免一次 query 太大
 */

export interface OverpassProfile {
  name: string;
  description: string;
  query: string;
}

/**
 * Profile A: Transport Nodes（交通节点：机场/渡轮/停车/公交）
 */
export const PROFILE_A_TRANSPORT: OverpassProfile = {
  name: 'Transport Nodes',
  description: '交通节点（机场/渡轮/停车/公交）',
  query: `[out:json][timeout:180];
(
  nwr["aeroway"="aerodrome"](around:{R},{LAT},{LNG});
  nwr["aeroway"="terminal"](around:{R},{LAT},{LNG});
  nwr["amenity"="ferry_terminal"](around:{R},{LAT},{LNG});
  nwr["man_made"="pier"](around:{R},{LAT},{LNG});
  nwr["public_transport"="station"](around:{R},{LAT},{LNG});
  nwr["highway"="bus_stop"](around:{R},{LAT},{LNG});
  nwr["amenity"="parking"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile B: Safety & Supply（安全保障点 + 补给）
 */
export const PROFILE_B_SAFETY_SUPPLY: OverpassProfile = {
  name: 'Safety & Supply',
  description: '安全保障点 + 补给（徒步/自驾都要）',
  query: `[out:json][timeout:180];
(
  nwr["amenity"="hospital"](around:{R},{LAT},{LNG});
  nwr["amenity"="clinic"](around:{R},{LAT},{LNG});
  nwr["amenity"="pharmacy"](around:{R},{LAT},{LNG});
  nwr["amenity"="police"](around:{R},{LAT},{LNG});
  nwr["amenity"="fuel"](around:{R},{LAT},{LNG});
  nwr["amenity"="charging_station"](around:{R},{LAT},{LNG});
  nwr["shop"="supermarket"](around:{R},{LAT},{LNG});
  nwr["shop"="convenience"](around:{R},{LAT},{LNG});
  nwr["amenity"="toilets"](around:{R},{LAT},{LNG});
  nwr["amenity"="shelter"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile C: Activity Entry Points（玩法入口点：徒步/观景/营地/DOC 小屋）
 */
export const PROFILE_C_ACTIVITY_ENTRY: OverpassProfile = {
  name: 'Activity Entry Points',
  description: '玩法入口点（徒步/观景/营地/DOC 小屋）',
  query: `[out:json][timeout:180];
(
  nwr["highway"="trailhead"](around:{R},{LAT},{LNG});
  nwr["tourism"="information"](around:{R},{LAT},{LNG});
  nwr["tourism"="viewpoint"](around:{R},{LAT},{LNG});
  nwr["tourism"="camp_site"](around:{R},{LAT},{LNG});
  nwr["tourism"="alpine_hut"](around:{R},{LAT},{LNG});
  nwr["amenity"="boat_rental"](around:{R},{LAT},{LNG});
  nwr["office"="tourism"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * Profile D: Natural Features（新西兰自然类：火山/地热/冰川/海岸）
 */
export const PROFILE_D_NATURAL: OverpassProfile = {
  name: 'Natural Features',
  description: '新西兰自然类（火山/地热/冰川/海岸）',
  query: `[out:json][timeout:180];
(
  nwr["natural"="volcano"](around:{R},{LAT},{LNG});
  nwr["natural"="geyser"](around:{R},{LAT},{LNG});
  nwr["natural"="hot_spring"](around:{R},{LAT},{LNG});
  nwr["natural"="glacier"](around:{R},{LAT},{LNG});
  nwr["natural"="waterfall"](around:{R},{LAT},{LNG});
  nwr["natural"="beach"](around:{R},{LAT},{LNG});
  nwr["natural"="peak"](around:{R},{LAT},{LNG});
);
out center tags;`
};

/**
 * 所有 Profile 列表
 */
export const NEW_ZEALAND_OVERPASS_PROFILES: OverpassProfile[] = [
  PROFILE_A_TRANSPORT,
  PROFILE_B_SAFETY_SUPPLY,
  PROFILE_C_ACTIVITY_ENTRY,
  PROFILE_D_NATURAL,
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

