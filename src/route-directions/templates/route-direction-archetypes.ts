// src/route-directions/templates/route-direction-archetypes.ts
/**
 * 路线方向分类母版（6大母型）
 * 
 * P1.3: 国家路线方向分类母版
 * 
 * 6大母型：
 * 1. 高海拔文化徒步（High-altitude Cultural Trekking）
 * 2. 峡湾/海岸线自驾（Fjord/Coastline Driving）
 * 3. 城市文化探索（Urban Cultural Exploration）
 * 4. 自然风光环线（Nature Scenic Loop）
 * 5. 冒险挑战路线（Adventure Challenge Route）
 * 6. 轻松休闲度假（Relaxed Leisure Vacation）
 * 
 * 每个母型包含：
 * - 默认标签
 * - 典型约束
 * - 风险画像
 * - 典型节奏
 * - 季节性特征
 * - 签名POI类型
 */

import { RouteDirectionData } from '../interfaces/route-direction.interface';

export type RouteDirectionArchetype =
  | 'HIGH_ALTITUDE_CULTURAL_TREKKING'
  | 'FJORD_COASTLINE_DRIVING'
  | 'URBAN_CULTURAL_EXPLORATION'
  | 'NATURE_SCENIC_LOOP'
  | 'ADVENTURE_CHALLENGE_ROUTE'
  | 'RELAXED_LEISURE_VACATION';

export interface ArchetypeTemplate {
  /** 母型ID */
  id: RouteDirectionArchetype;
  /** 母型名称（中文） */
  nameCN: string;
  /** 母型名称（英文） */
  nameEN: string;
  /** 母型描述 */
  description: string;
  /** 默认标签 */
  defaultTags: string[];
  /** 典型约束模板 */
  constraintsTemplate: {
    hard?: Record<string, any>;
    soft?: Record<string, any>;
  };
  /** 风险画像模板 */
  riskProfileTemplate: Record<string, any>;
  /** 典型节奏 */
  typicalPace: 'relaxed' | 'moderate' | 'intense';
  /** 季节性特征 */
  seasonalityTemplate: {
    bestMonths?: number[];
    avoidMonths?: number[];
    weatherWindow?: boolean;
  };
  /** 签名POI类型 */
  signaturePoiTypes: string[];
  /** 典型行程骨架 */
  itinerarySkeletonTemplate: {
    dayThemes?: string[];
    restDaysRequired?: number[];
    dailyPace?: string;
  };
  /** 适用地区特征 */
  applicableRegions: {
    elevationRange?: { min: number; max: number };
    terrainTypes?: string[];
    climateZones?: string[];
  };
}

/**
 * 6大母型模板定义
 */
export const ROUTE_DIRECTION_ARCHETYPES: Record<RouteDirectionArchetype, ArchetypeTemplate> = {
  /**
   * 1. 高海拔文化徒步
   * 典型例子：西藏、尼泊尔、秘鲁
   */
  HIGH_ALTITUDE_CULTURAL_TREKKING: {
    id: 'HIGH_ALTITUDE_CULTURAL_TREKKING',
    nameCN: '高海拔文化徒步',
    nameEN: 'High-altitude Cultural Trekking',
    description: '结合高海拔徒步和文化探索的路线，适合有经验的旅行者',
    defaultTags: ['徒步', '文化', '高海拔', '挑战', '自然', 'hiking', 'culture', 'high_altitude', 'challenge'],
    constraintsTemplate: {
      hard: {
        rapidAscentForbidden: true,
        requiresPermit: false, // 根据具体地区调整
        requiresGuide: false, // 根据具体地区调整
      },
      soft: {
        maxDailyAscentM: 800, // 高海拔地区应该更保守
        maxElevationM: 5500, // 根据具体地区调整
        maxSlopePct: 25,
        bufferTimeMin: 20, // 高海拔需要更多缓冲时间
      },
    },
    riskProfileTemplate: {
      altitudeSickness: true,
      roadClosure: true, // 高海拔地区可能因天气封路
      weatherWindow: true,
      weatherWindowMonths: [5, 6, 7, 8, 9, 10], // 夏季窗口
      consecutiveHighAltitudeDays: { min: 3, max: 10 },
      consecutiveAscentThreshold: 1200,
    },
    typicalPace: 'moderate',
    seasonalityTemplate: {
      bestMonths: [5, 6, 7, 8, 9, 10], // 夏季最佳
      avoidMonths: [11, 12, 1, 2, 3], // 冬季避免
      weatherWindow: true,
    },
    signaturePoiTypes: [
      'MOUNTAIN_PASS',
      'MONASTERY',
      'VIEWPOINT',
      'TRAILHEAD',
      'CULTURAL_SITE',
      'ACCLIMATIZATION_POINT',
    ],
    itinerarySkeletonTemplate: {
      dayThemes: ['适应', '探索', '挑战', '文化', '休息', '登高', '返程'],
      restDaysRequired: [2, 4, 6], // 第2、4、6天建议休息
      dailyPace: 'moderate',
    },
    applicableRegions: {
      elevationRange: { min: 3000, max: 6000 },
      terrainTypes: ['mountain', 'plateau', 'highland'],
      climateZones: ['alpine', 'subalpine'],
    },
  },

  /**
   * 2. 峡湾/海岸线自驾
   * 典型例子：冰岛、挪威、新西兰南岛
   */
  FJORD_COASTLINE_DRIVING: {
    id: 'FJORD_COASTLINE_DRIVING',
    nameCN: '峡湾/海岸线自驾',
    nameEN: 'Fjord/Coastline Driving',
    description: '沿着海岸线或峡湾的自驾路线，风景优美，节奏轻松',
    defaultTags: ['自驾', '海岸', '峡湾', '自然', '摄影', '轻松', 'driving', 'coastline', 'fjord', 'nature', 'photography'],
    constraintsTemplate: {
      hard: {},
      soft: {
        maxDailyAscentM: 500, // 海岸线通常较平缓
        maxElevationM: 2000,
        maxSlopePct: 15,
        bufferTimeMin: 15,
      },
    },
    riskProfileTemplate: {
      altitudeSickness: false,
      roadClosure: true, // 可能因天气封路
      ferryDependent: true, // 可能依赖渡轮
      weatherWindow: true,
      weatherWindowMonths: [6, 7, 8], // 夏季窗口
    },
    typicalPace: 'relaxed',
    seasonalityTemplate: {
      bestMonths: [6, 7, 8, 9], // 夏季最佳
      avoidMonths: [11, 12, 1, 2], // 冬季避免
      weatherWindow: true,
    },
    signaturePoiTypes: [
      'VIEWPOINT',
      'BEACH',
      'LIGHTHOUSE',
      'FERRY_TERMINAL',
      'COASTAL_TOWN',
      'NATURAL_WONDER',
    ],
    itinerarySkeletonTemplate: {
      dayThemes: ['出发', '海岸', '峡湾', '小镇', '摄影', '返程'],
      restDaysRequired: [],
      dailyPace: 'relaxed',
    },
    applicableRegions: {
      elevationRange: { min: 0, max: 1500 },
      terrainTypes: ['coastline', 'fjord', 'island'],
      climateZones: ['temperate', 'subarctic'],
    },
  },

  /**
   * 3. 城市文化探索
   * 典型例子：欧洲城市、日本、中国城市
   */
  URBAN_CULTURAL_EXPLORATION: {
    id: 'URBAN_CULTURAL_EXPLORATION',
    nameCN: '城市文化探索',
    nameEN: 'Urban Cultural Exploration',
    description: '以城市为中心的文化探索路线，节奏轻松，适合所有年龄段',
    defaultTags: ['城市', '文化', '历史', '博物馆', '轻松', 'urban', 'culture', 'history', 'museum'],
    constraintsTemplate: {
      hard: {},
      soft: {
        maxDailyAscentM: 200, // 城市通常较平缓
        maxElevationM: 1000,
        maxSlopePct: 10,
        bufferTimeMin: 10,
      },
    },
    riskProfileTemplate: {
      altitudeSickness: false,
      roadClosure: false,
      ferryDependent: false,
      weatherWindow: false,
    },
    typicalPace: 'relaxed',
    seasonalityTemplate: {
      bestMonths: [4, 5, 6, 7, 8, 9, 10], // 春季到秋季
      avoidMonths: [], // 城市全年可游
      weatherWindow: false,
    },
    signaturePoiTypes: [
      'MUSEUM',
      'HISTORIC_SITE',
      'CITY_CENTER',
      'MARKET',
      'RESTAURANT',
      'SHOPPING',
    ],
    itinerarySkeletonTemplate: {
      dayThemes: ['到达', '探索', '文化', '美食', '购物', '返程'],
      restDaysRequired: [],
      dailyPace: 'relaxed',
    },
    applicableRegions: {
      elevationRange: { min: 0, max: 2000 },
      terrainTypes: ['urban', 'city'],
      climateZones: ['temperate', 'subtropical', 'tropical'],
    },
  },

  /**
   * 4. 自然风光环线
   * 典型例子：新西兰、加拿大、美国国家公园
   */
  NATURE_SCENIC_LOOP: {
    id: 'NATURE_SCENIC_LOOP',
    nameCN: '自然风光环线',
    nameEN: 'Nature Scenic Loop',
    description: '以自然风光为主的环线路线，适合喜欢户外和摄影的旅行者',
    defaultTags: ['自然', '环线', '摄影', '户外', '轻松', 'nature', 'scenic', 'loop', 'photography', 'outdoor'],
    constraintsTemplate: {
      hard: {},
      soft: {
        maxDailyAscentM: 600,
        maxElevationM: 3000,
        maxSlopePct: 20,
        bufferTimeMin: 15,
      },
    },
    riskProfileTemplate: {
      altitudeSickness: false, // 除非超过3000m
      roadClosure: true, // 可能因天气封路
      ferryDependent: false,
      weatherWindow: true,
      weatherWindowMonths: [5, 6, 7, 8, 9, 10],
    },
    typicalPace: 'moderate',
    seasonalityTemplate: {
      bestMonths: [5, 6, 7, 8, 9, 10], // 春季到秋季
      avoidMonths: [11, 12, 1, 2, 3], // 冬季避免
      weatherWindow: true,
    },
    signaturePoiTypes: [
      'NATIONAL_PARK',
      'VIEWPOINT',
      'WATERFALL',
      'LAKE',
      'TRAIL',
      'WILDLIFE_VIEWING',
    ],
    itinerarySkeletonTemplate: {
      dayThemes: ['出发', '探索', '摄影', '自然', '环线', '返程'],
      restDaysRequired: [],
      dailyPace: 'moderate',
    },
    applicableRegions: {
      elevationRange: { min: 0, max: 4000 },
      terrainTypes: ['mountain', 'forest', 'lake', 'valley'],
      climateZones: ['temperate', 'alpine'],
    },
  },

  /**
   * 5. 冒险挑战路线
   * 典型例子：极限徒步、攀岩、越野
   */
  ADVENTURE_CHALLENGE_ROUTE: {
    id: 'ADVENTURE_CHALLENGE_ROUTE',
    nameCN: '冒险挑战路线',
    nameEN: 'Adventure Challenge Route',
    description: '高难度、高风险的冒险路线，适合有经验的户外爱好者',
    defaultTags: ['挑战', '冒险', '徒步', '极限', '户外', 'adventure', 'challenge', 'extreme', 'outdoor'],
    constraintsTemplate: {
      hard: {
        requiresPermit: true, // 通常需要许可
        requiresGuide: true, // 通常需要向导
        rapidAscentForbidden: false, // 允许快速上升（但需注意）
      },
      soft: {
        maxDailyAscentM: 1500, // 允许更高的爬升
        maxElevationM: 6000,
        maxSlopePct: 35, // 允许更陡的坡度
        bufferTimeMin: 30, // 需要更多缓冲时间
      },
    },
    riskProfileTemplate: {
      altitudeSickness: true,
      roadClosure: true,
      weatherWindow: true,
      weatherWindowMonths: [6, 7, 8, 9], // 夏季窗口
      consecutiveHighAltitudeDays: { min: 5, max: 15 },
      consecutiveAscentThreshold: 2000,
    },
    typicalPace: 'intense',
    seasonalityTemplate: {
      bestMonths: [6, 7, 8, 9], // 夏季最佳
      avoidMonths: [11, 12, 1, 2, 3, 4], // 冬季和早春避免
      weatherWindow: true,
    },
    signaturePoiTypes: [
      'MOUNTAIN_PEAK',
      'TRAILHEAD',
      'BASE_CAMP',
      'VIEWPOINT',
      'CHALLENGE_POINT',
    ],
    itinerarySkeletonTemplate: {
      dayThemes: ['准备', '适应', '挑战', '登顶', '下降', '恢复'],
      restDaysRequired: [2, 4], // 第2、4天建议休息
      dailyPace: 'intense',
    },
    applicableRegions: {
      elevationRange: { min: 2000, max: 8000 },
      terrainTypes: ['mountain', 'alpine', 'extreme'],
      climateZones: ['alpine', 'arctic'],
    },
  },

  /**
   * 6. 轻松休闲度假
   * 典型例子：海滩度假、温泉、SPA
   */
  RELAXED_LEISURE_VACATION: {
    id: 'RELAXED_LEISURE_VACATION',
    nameCN: '轻松休闲度假',
    nameEN: 'Relaxed Leisure Vacation',
    description: '以放松和休闲为主的度假路线，节奏轻松，适合所有年龄段',
    defaultTags: ['轻松', '休闲', '度假', '海滩', '温泉', 'relaxed', 'leisure', 'vacation', 'beach', 'spa'],
    constraintsTemplate: {
      hard: {},
      soft: {
        maxDailyAscentM: 100, // 非常平缓
        maxElevationM: 500,
        maxSlopePct: 5,
        bufferTimeMin: 20, // 更多缓冲时间用于休息
      },
    },
    riskProfileTemplate: {
      altitudeSickness: false,
      roadClosure: false,
      ferryDependent: false,
      weatherWindow: false,
    },
    typicalPace: 'relaxed',
    seasonalityTemplate: {
      bestMonths: [5, 6, 7, 8, 9, 10], // 春季到秋季
      avoidMonths: [], // 全年可游
      weatherWindow: false,
    },
    signaturePoiTypes: [
      'BEACH',
      'SPA',
      'RESORT',
      'RESTAURANT',
      'SHOPPING',
      'ENTERTAINMENT',
    ],
    itinerarySkeletonTemplate: {
      dayThemes: ['到达', '放松', '休闲', '享受', '返程'],
      restDaysRequired: [],
      dailyPace: 'relaxed',
    },
    applicableRegions: {
      elevationRange: { min: 0, max: 1000 },
      terrainTypes: ['coastline', 'beach', 'resort'],
      climateZones: ['tropical', 'subtropical', 'temperate'],
    },
  },
};

/**
 * 根据母型生成RouteDirection骨架
 * 
 * @param archetype 母型ID
 * @param countryCode 国家代码
 * @param customizations 自定义配置（覆盖默认值）
 * @returns RouteDirection骨架
 */
export function generateRouteDirectionFromArchetype(
  archetype: RouteDirectionArchetype,
  countryCode: string,
  customizations: {
    name?: string;
    nameCN?: string;
    nameEN?: string;
    description?: string;
    regions?: string[];
    entryHubs?: string[];
    corridorGeom?: string;
    [key: string]: any;
  } = {}
): Partial<RouteDirectionData> {
  const template = ROUTE_DIRECTION_ARCHETYPES[archetype];

  if (!template) {
    throw new Error(`Unknown archetype: ${archetype}`);
  }

  // 生成默认名称
  const defaultName = `${countryCode}_${archetype}`;
  const defaultNameCN = `${template.nameCN}`;
  const defaultNameEN = `${template.nameEN}`;

  return {
    countryCode,
    name: customizations.name || defaultName,
    nameCN: customizations.nameCN || defaultNameCN,
    nameEN: customizations.nameEN || defaultNameEN,
    description: customizations.description || template.description,
    tags: [...template.defaultTags],
    regions: customizations.regions || [],
    entryHubs: customizations.entryHubs || [],
    constraints: {
      ...template.constraintsTemplate,
      ...(customizations.constraints || {}),
    },
    riskProfile: {
      ...template.riskProfileTemplate,
      ...(customizations.riskProfile || {}),
    },
    seasonality: {
      ...template.seasonalityTemplate,
      ...(customizations.seasonality || {}),
    },
    signaturePois: {
      types: template.signaturePoiTypes,
      examples: customizations.signaturePois?.examples || [],
    },
    itinerarySkeleton: {
      ...template.itinerarySkeletonTemplate,
      ...(customizations.itinerarySkeleton || {}),
    },
    metadata: {
      archetype: archetype,
      ...(customizations.metadata || {}),
      ...(customizations.corridorGeom ? { corridorGeom: customizations.corridorGeom } : {}),
    },
  };
}

/**
 * 根据地区特征推荐合适的母型
 * 
 * @param regionFeatures 地区特征
 * @returns 推荐的母型列表（按匹配度排序）
 */
export function recommendArchetypesByRegion(
  regionFeatures: {
    elevation?: number;
    terrainType?: string;
    climateZone?: string;
    hasCoastline?: boolean;
    hasCities?: boolean;
  }
): Array<{ archetype: RouteDirectionArchetype; score: number; reason: string }> {
  const recommendations: Array<{ archetype: RouteDirectionArchetype; score: number; reason: string }> = [];

  for (const [archetypeId, template] of Object.entries(ROUTE_DIRECTION_ARCHETYPES)) {
    let score = 0;
    const reasons: string[] = [];

    const archetype = archetypeId as RouteDirectionArchetype;
    const applicable = template.applicableRegions;

    // 检查海拔范围
    if (regionFeatures.elevation !== undefined && applicable.elevationRange) {
      if (
        regionFeatures.elevation >= applicable.elevationRange.min &&
        regionFeatures.elevation <= applicable.elevationRange.max
      ) {
        score += 30;
        reasons.push(`海拔匹配（${regionFeatures.elevation}m在${applicable.elevationRange.min}-${applicable.elevationRange.max}m范围内）`);
      } else {
        score -= 10;
      }
    }

    // 检查地形类型
    if (regionFeatures.terrainType && applicable.terrainTypes) {
      if (applicable.terrainTypes.includes(regionFeatures.terrainType)) {
        score += 25;
        reasons.push(`地形类型匹配（${regionFeatures.terrainType}）`);
      }
    }

    // 检查气候带
    if (regionFeatures.climateZone && applicable.climateZones) {
      if (applicable.climateZones.includes(regionFeatures.climateZone)) {
        score += 20;
        reasons.push(`气候带匹配（${regionFeatures.climateZone}）`);
      }
    }

    // 特殊检查：海岸线
    if (regionFeatures.hasCoastline) {
      if (archetype === 'FJORD_COASTLINE_DRIVING' || archetype === 'RELAXED_LEISURE_VACATION') {
        score += 15;
        reasons.push('有海岸线，适合海岸/度假路线');
      }
    }

    // 特殊检查：城市
    if (regionFeatures.hasCities) {
      if (archetype === 'URBAN_CULTURAL_EXPLORATION') {
        score += 15;
        reasons.push('有城市，适合城市文化探索');
      }
    }

    if (score > 0) {
      recommendations.push({
        archetype,
        score,
        reason: reasons.join('；'),
      });
    }
  }

  // 按分数排序
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations;
}

/**
 * 获取所有母型列表
 */
export function getAllArchetypes(): ArchetypeTemplate[] {
  return Object.values(ROUTE_DIRECTION_ARCHETYPES);
}

/**
 * 根据ID获取母型
 */
export function getArchetypeById(id: RouteDirectionArchetype): ArchetypeTemplate | undefined {
  return ROUTE_DIRECTION_ARCHETYPES[id];
}

