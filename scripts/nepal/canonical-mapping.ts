// scripts/nepal/canonical-mapping.ts
/**
 * 尼泊尔 POI Canonical 分类映射
 * 
 * 将 OSM tags 映射为系统标准分类
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
 * 尼泊尔新增/强化的 Canonical 分类映射
 */
export const NEPAL_CANONICAL_MAPPINGS: CanonicalMapping[] = [
  // TRAILHEAD - 徒步入口
  {
    canonicalType: 'TRAILHEAD',
    osmTags: [
      { key: 'highway', value: 'trailhead', description: '徒步入口' },
    ],
    priority: 10,
  },
  
  // HUT - 山屋/庇护所
  {
    canonicalType: 'HUT',
    osmTags: [
      { key: 'tourism', value: 'alpine_hut', description: '高山小屋' },
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
  
  // TEAHOUSE_LODGE - 茶屋/客栈（尼泊尔特色）
  {
    canonicalType: 'TEAHOUSE_LODGE',
    osmTags: [
      { key: 'tourism', value: 'guest_house', description: '客栈' },
      { key: 'tourism', value: 'hotel', description: '酒店' },
      { key: 'tourism', value: 'hostel', description: '青年旅舍' },
      { key: 'name', value: /(Tea ?House|Teahouse|Lodge|Guest House)/i, description: '名称包含茶屋/客栈关键词' },
    ],
    priority: 9,
  },
  
  // TOILETS - 厕所
  {
    canonicalType: 'TOILETS',
    osmTags: [
      { key: 'amenity', value: 'toilets', description: '厕所' },
    ],
    priority: 8,
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
  
  // PARKING - 停车场
  {
    canonicalType: 'PARKING',
    osmTags: [
      { key: 'amenity', value: 'parking', description: '停车场' },
    ],
    priority: 6,
  },
  
  // VIEWPOINT - 观景点（已有，但尼泊尔需要强化）
  {
    canonicalType: 'VIEWPOINT',
    osmTags: [
      { key: 'tourism', value: 'viewpoint', description: '观景点' },
      { key: 'tourism', value: 'information', description: '信息点' },
    ],
    priority: 7,
  },
];

/**
 * 将 OSM tags 映射为 Canonical 类型
 */
export function mapOsmTagsToCanonical(tags: Record<string, string>): string | null {
  // 按优先级排序
  const sortedMappings = [...NEPAL_CANONICAL_MAPPINGS].sort((a, b) => b.priority - a.priority);
  
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
  return NEPAL_CANONICAL_MAPPINGS.map(m => m.canonicalType);
}

