// scripts/iceland/canonical-mapping.ts
/**
 * 冰岛 OSM Tags -> Canonical Type 映射
 * 
 * 将 OSM 的 tags 映射为系统可用的统一类型
 * 包含冰岛特定的分类（瀑布/温泉/地热/冰川等）
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
  
  // 1. 交通节点
  if (tags.aeroway === 'aerodrome' || tags.aeroway === 'terminal') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'AIRPORT' };
  }
  if (tags.amenity === 'ferry_terminal') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PORT_FERRY_TERMINAL' };
  }
  if (tags.man_made === 'pier' || tags.landuse === 'harbour' || tags.water === 'harbour' || tags.waterway === 'dock') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PORT_PIER' };
  }
  if (tags.public_transport === 'station' || tags.highway === 'bus_stop') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'BUS_STATION' };
  }
  if (tags.amenity === 'parking') {
    return { category: PlaceCategory.TRANSIT_HUB, canonicalType: 'PARKING' };
  }
  
  // 2. 安全保障点
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
  
  // 3. 补给点
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
  if (tags.amenity === 'shelter') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'SHELTER' };
  }
  
  // 4. 冰岛自然景点（ATTRACTION_NATURE）
  if (tags.natural === 'waterfall') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION_NATURE_WATERFALL' };
  }
  if (tags.natural === 'hot_spring') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION_NATURE_HOT_SPRING' };
  }
  if (tags.natural === 'geyser') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION_NATURE_GEYSER' };
  }
  if (tags.natural === 'glacier') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION_NATURE_GLACIER' };
  }
  if (tags.natural === 'volcano') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION_NATURE_VOLCANO' };
  }
  if (tags.natural === 'beach') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION_NATURE_BEACH' };
  }
  
  // 5. 观景点/信息点
  if (tags.tourism === 'viewpoint') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'VIEWPOINT' };
  }
  if (tags.tourism === 'information') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'INFORMATION_CENTER' };
  }
  if (tags.tourism === 'attraction') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'ATTRACTION' };
  }
  
  // 6. 徒步/露营
  if (tags.highway === 'trailhead') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'TRAILHEAD' };
  }
  if (tags.tourism === 'camp_site') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'CAMPING' };
  }
  
  // 7. 冰岛特色：SPA/泳池
  if (tags.leisure === 'swimming_pool' || tags.amenity === 'spa') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'SPA_POOL' };
  }
  
  // 8. 旅游服务
  if (tags.office === 'tourism' || tags.tourism === 'agency') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'TOUR_OPERATOR' };
  }
  if (tags.amenity === 'car_rental') {
    return { category: PlaceCategory.ATTRACTION, canonicalType: 'CAR_RENTAL' };
  }
  if (tags.tourism === 'hotel' || tags.tourism === 'guest_house') {
    return { category: PlaceCategory.HOTEL, canonicalType: 'HOTEL' };
  }
  
  // 默认
  return { category: PlaceCategory.ATTRACTION, canonicalType: 'OTHER' };
}

/**
 * 判断是否为"高地/徒步入口"候选
 */
export function isHighlandTrailheadCandidate(tags: Record<string, string>): boolean {
  return !!(
    tags.highway === 'trailhead' ||
    (tags.tourism === 'information' && tags.information) ||
    tags.tourism === 'camp_site'
  );
}

/**
 * 判断是否为"自驾关键点"（加油站/停车/厕所）
 */
export function isDrivingKeyPoint(tags: Record<string, string>): boolean {
  return !!(
    tags.amenity === 'fuel' ||
    tags.amenity === 'parking' ||
    tags.amenity === 'toilets'
  );
}

/**
 * 判断是否为"温泉/地热点"（需要安全提示）
 */
export function isThermalFeature(tags: Record<string, string>): boolean {
  return !!(
    tags.natural === 'hot_spring' ||
    tags.natural === 'geyser' ||
    tags.natural === 'volcano' ||
    tags.leisure === 'swimming_pool' ||
    tags.amenity === 'spa'
  );
}


