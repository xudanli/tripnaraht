// scripts/svalbard/canonical-mapping.ts
/**
 * 斯瓦尔巴 OSM Tags -> Canonical Type 映射
 * 
 * 将 OSM 的 tags 映射为系统可用的统一类型
 */

import { PlaceCategory } from '@prisma/client';

export interface CanonicalMapping {
  category: PlaceCategory;
  canonicalType: string;
  priority: number; // 优先级（数字越大越优先）
}

/**
 * 映射 OSM tags 为 canonical type
 */
export function mapOsmTagsToCanonical(tags: Record<string, string>): {
  category: PlaceCategory;
  canonicalType: string;
} {
  // 优先级从高到低检查
  
  // 1. 码头/港区/出海相关
  if (tags.amenity === 'ferry_terminal') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PORT_FERRY_TERMINAL' };
  }
  if (tags.man_made === 'pier') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PORT_PIER' };
  }
  if (tags.leisure === 'marina' || tags.landuse === 'harbour' || tags.water === 'harbour' || tags.harbour) {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PORT_MARINA' };
  }
  if (tags.waterway === 'dock') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PORT_DOCK' };
  }
  if (tags.amenity === 'boat_rental') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'BOAT_RENTAL' };
  }
  
  // 2. 徒步入口
  if (tags.highway === 'trailhead') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'TRAILHEAD' };
  }
  
  // 3. 信息点/观景点
  if (tags.tourism === 'information') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'INFORMATION_CENTER' };
  }
  if (tags.tourism === 'viewpoint') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'VIEWPOINT' };
  }
  
  // 4. 安全保障点
  if (tags.amenity === 'hospital') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'HOSPITAL' };
  }
  if (tags.amenity === 'clinic') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'CLINIC' };
  }
  if (tags.amenity === 'pharmacy') {
    return { category: PlaceCategory.SHOPPING, canonicalType: 'PHARMACY' };
  }
  if (tags.amenity === 'police') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'POLICE' };
  }
  if (tags.amenity === 'fire_station') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'FIRE_STATION' };
  }
  
  // 5. 补给点
  if (tags.amenity === 'fuel') {
    return { category: PlaceCategory.SHOPPING, canonicalType: 'FUEL_STATION' };
  }
  if (tags.shop === 'supermarket') {
    return { category: PlaceCategory.SHOPPING, canonicalType: 'SUPERMARKET' };
  }
  if (tags.shop === 'convenience') {
    return { category: PlaceCategory.SHOPPING, canonicalType: 'CONVENIENCE_STORE' };
  }
  if (tags.amenity === 'toilets') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'TOILETS' };
  }
  if (tags.shelter) {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'SHELTER' };
  }
  
  // 6. 交通节点
  if (tags.aeroway === 'aerodrome' || tags.aeroway === 'terminal') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'AIRPORT' };
  }
  if (tags.amenity === 'parking') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PARKING' };
  }
  
  // 7. 户外服务
  if (tags.shop === 'outdoor') {
    return { category: PlaceCategory.SHOPPING, canonicalType: 'OUTDOOR_SHOP' };
  }
  if (tags.office === 'tourism' || tags.tourism === 'agency') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'TOURISM_AGENCY' };
  }
  
  // 默认
  return { category: PlaceCategory.ATTRACTION, canonicalType: 'OTHER' };
}

/**
 * 判断是否为"出海集合点"候选
 */
export function isPickupPointCandidate(tags: Record<string, string>): boolean {
  return !!(
    tags.amenity === 'ferry_terminal' ||
    tags.man_made === 'pier' ||
    tags.leisure === 'marina' ||
    tags.landuse === 'harbour' ||
    tags.water === 'harbour' ||
    tags.harbour ||
    tags.waterway === 'dock' ||
    tags.office === 'tourism' ||
    tags.tourism === 'agency' ||
    tags.amenity === 'boat_rental'
  );
}

/**
 * 判断是否为"徒步入口"候选
 */
export function isTrailheadCandidate(tags: Record<string, string>): boolean {
  return !!(
    tags.highway === 'trailhead' ||
    (tags.tourism === 'information' && tags.information)
  );
}



