// scripts/new-zealand/canonical-mapping.ts
/**
 * 新西兰 POI Canonical 分类映射
 * 
 * 将 OSM tags 映射为系统标准分类
 * 
 * 新西兰特色分类：
 * - TRAILHEAD: 徒步入口（可执行性核心）
 * - HUT: DOC 小屋/营地（新西兰徒步必备）
 * - CAMPING: 露营地
 * - PARKING: 停车场（景点入口基本就是停车场）
 * - TOILETS: 厕所（新西兰徒步/自驾极有用）
 * - EV_CHARGER: 电动车充电站（NZ 电车自驾很实用）
 * - VOLCANIC/GEOTHERMAL: 火山/地热（触发安全提示）
 * - FERRY_TERMINAL: 北南岛渡轮关键
 */

export interface CanonicalMapping {
  canonicalType: string;
  osmTags: Array<{
    key: string;
    value?: string | RegExp;
    description: string;
  }>;
  priority: number; // 优先级，数字越大优先级越高
}

/**
 * 新西兰 Canonical 分类映射
 */
export const NEW_ZEALAND_CANONICAL_MAPPINGS: CanonicalMapping[] = [
  // TRAILHEAD - 徒步入口（可执行性核心）
  {
    canonicalType: 'TRAILHEAD',
    osmTags: [
      { key: 'highway', value: 'trailhead', description: '徒步入口' },
    ],
    priority: 10,
  },
  
  // HUT - DOC 小屋/营地（新西兰徒步必备）
  {
    canonicalType: 'HUT',
    osmTags: [
      { key: 'tourism', value: 'alpine_hut', description: 'DOC 小屋' },
      { key: 'amenity', value: 'shelter', description: '庇护所' },
    ],
    priority: 10,
  },
  
  // CAMPING - 露营地
  {
    canonicalType: 'CAMPING',
    osmTags: [
      { key: 'tourism', value: 'camp_site', description: '露营地' },
    ],
    priority: 10,
  },
  
  // PARKING - 停车场（景点入口基本就是停车场）
  {
    canonicalType: 'PARKING',
    osmTags: [
      { key: 'amenity', value: 'parking', description: '停车场' },
    ],
    priority: 9,
  },
  
  // TOILETS - 厕所（新西兰徒步/自驾极有用）
  {
    canonicalType: 'TOILETS',
    osmTags: [
      { key: 'amenity', value: 'toilets', description: '厕所' },
    ],
    priority: 8,
  },
  
  // EV_CHARGER - 电动车充电站（NZ 电车自驾很实用）
  {
    canonicalType: 'EV_CHARGER',
    osmTags: [
      { key: 'amenity', value: 'charging_station', description: '充电站' },
    ],
    priority: 8,
  },
  
  // VOLCANIC - 火山（触发安全提示）
  {
    canonicalType: 'VOLCANIC',
    osmTags: [
      { key: 'natural', value: 'volcano', description: '火山' },
    ],
    priority: 9,
  },
  
  // GEOTHERMAL - 地热（触发安全提示）
  {
    canonicalType: 'GEOTHERMAL',
    osmTags: [
      { key: 'natural', value: 'geyser', description: '间歇泉' },
      { key: 'natural', value: 'hot_spring', description: '温泉' },
    ],
    priority: 9,
  },
  
  // FERRY_TERMINAL - 渡轮码头（北南岛渡轮关键）
  {
    canonicalType: 'FERRY_TERMINAL',
    osmTags: [
      { key: 'amenity', value: 'ferry_terminal', description: '渡轮码头' },
      { key: 'man_made', value: 'pier', description: '码头' },
    ],
    priority: 10,
  },
  
  // VIEWPOINT - 观景点
  {
    canonicalType: 'VIEWPOINT',
    osmTags: [
      { key: 'tourism', value: 'viewpoint', description: '观景点' },
      { key: 'tourism', value: 'information', description: '信息点' },
    ],
    priority: 7,
  },
  
  // GLACIER - 冰川
  {
    canonicalType: 'GLACIER',
    osmTags: [
      { key: 'natural', value: 'glacier', description: '冰川' },
    ],
    priority: 8,
  },
  
  // WATERFALL - 瀑布
  {
    canonicalType: 'WATERFALL',
    osmTags: [
      { key: 'natural', value: 'waterfall', description: '瀑布' },
    ],
    priority: 7,
  },
  
  // BEACH - 海滩
  {
    canonicalType: 'BEACH',
    osmTags: [
      { key: 'natural', value: 'beach', description: '海滩' },
    ],
    priority: 6,
  },
  
  // PEAK - 山峰
  {
    canonicalType: 'PEAK',
    osmTags: [
      { key: 'natural', value: 'peak', description: '山峰' },
    ],
    priority: 6,
  },
  
  // SUPPLY - 补给点
  {
    canonicalType: 'SUPPLY',
    osmTags: [
      { key: 'shop', value: 'supermarket', description: '超市' },
      { key: 'shop', value: 'convenience', description: '便利店' },
      { key: 'amenity', value: 'fuel', description: '加油站' },
    ],
    priority: 8,
  },
  
  // SAFETY_MEDICAL - 安全/医疗
  {
    canonicalType: 'SAFETY_MEDICAL',
    osmTags: [
      { key: 'amenity', value: 'hospital', description: '医院' },
      { key: 'amenity', value: 'clinic', description: '诊所' },
      { key: 'amenity', value: 'pharmacy', description: '药房' },
      { key: 'amenity', value: 'police', description: '警察局' },
    ],
    priority: 9,
  },
  
  // AIRPORT - 机场
  {
    canonicalType: 'AIRPORT',
    osmTags: [
      { key: 'aeroway', value: 'aerodrome', description: '机场' },
      { key: 'aeroway', value: 'terminal', description: '航站楼' },
    ],
    priority: 10,
  },
  
  // TRANSIT - 交通枢纽
  {
    canonicalType: 'TRANSIT',
    osmTags: [
      { key: 'public_transport', value: 'station', description: '公共交通站' },
      { key: 'highway', value: 'bus_stop', description: '巴士站' },
    ],
    priority: 7,
  },
];

/**
 * 将 OSM tags 映射为 Canonical 类型
 */
export function mapOsmTagsToCanonical(tags: Record<string, string>): string | null {
  // 按优先级排序
  const sortedMappings = [...NEW_ZEALAND_CANONICAL_MAPPINGS].sort((a, b) => b.priority - a.priority);
  
  for (const mapping of sortedMappings) {
    for (const osmTag of mapping.osmTags) {
      const tagValue = tags[osmTag.key];
      
      if (!tagValue) continue;
      
      // 如果是正则表达式
      if (osmTag.value instanceof RegExp) {
        if (osmTag.value.test(tagValue)) {
          return mapping.canonicalType;
        }
      } 
      // 如果是字符串匹配
      else if (osmTag.value === tagValue) {
        return mapping.canonicalType;
      }
    }
  }
  
  return null;
}

/**
 * 获取所有支持的 Canonical 类型
 */
export function getSupportedCanonicalTypes(): string[] {
  return NEW_ZEALAND_CANONICAL_MAPPINGS.map(m => m.canonicalType);
}

