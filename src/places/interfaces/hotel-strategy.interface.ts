// src/places/interfaces/hotel-strategy.interface.ts

/**
 * 酒店推荐策略枚举
 */
export enum HotelRecommendationStrategy {
  /** 重心法：适合"特种兵"，找所有景点的地理中心点 */
  CENTROID = 'CENTROID',
  
  /** 交通枢纽法：适合"大多数人"，优先选择离地铁站/车站近的 */
  HUB = 'HUB',
  
  /** 度假模式：适合"躺平"，牺牲距离换取档次 */
  RESORT = 'RESORT',
}

/**
 * 酒店位置评分
 * 
 * 存储在 Place.metadata.location_score 中
 */
export interface LocationScore {
  /** 距离市中心距离（公里） */
  center_distance_km?: number;
  
  /** 距离最近地铁站步行分钟数（关键数据） */
  nearest_station_walk_min?: number;
  
  /** 是否位于交通枢纽 */
  is_transport_hub?: boolean;
  
  /** 距离主要景点的平均距离（公里） */
  avg_distance_to_attractions_km?: number;
  
  /** 交通便利度评分（1-10） */
  transport_convenience_score?: number;
}

/**
 * 酒店推荐请求参数
 */
export interface HotelRecommendationRequest {
  /** 行程 ID（用于获取景点列表） */
  tripId?: string;
  
  /** 景点 ID 列表（如果直接提供） */
  attractionIds?: number[];
  
  /** 推荐策略 */
  strategy: HotelRecommendationStrategy;
  
  /** 预算上限（每晚，元） */
  maxBudget?: number;
  
  /** 最低星级要求 */
  minTier?: number;
  
  /** 时间价值（元/小时），默认 50 */
  timeValuePerHour?: number;
  
  /** 是否考虑隐形成本 */
  includeHiddenCost?: boolean;
}

/**
 * 酒店推荐结果
 */
export interface HotelRecommendation {
  /** 酒店 ID */
  hotelId: number;
  
  /** 酒店名称 */
  name: string;
  
  /** 每晚房价（元） */
  roomRate: number;
  
  /** 酒店星级 */
  tier: number;
  
  /** 位置评分 */
  locationScore?: LocationScore;
  
  /** 综合成本（如果计算了隐形成本） */
  totalCost?: number;
  
  /** 成本分解（如果计算了隐形成本） */
  costBreakdown?: {
    roomRate: number;
    transportCost: number;
    timeCost: number;
    hiddenCost: number;
    totalCost: number;
  };
  
  /** 推荐理由 */
  recommendationReason: string;
  
  /** 距离中心点/枢纽的距离（米） */
  distanceToCenter?: number;
}

