// src/trips/readiness/types/trip-context.types.ts

/**
 * Trip Context Types
 * 
 * 定义规则引擎运行时需要的上下文信息
 * 这些信息从 TripWorldState 和用户画像中提取
 */

export interface TravelerProfile {
  nationality?: string; // ISO country code
  residencyCountry?: string; // ISO country code
  tags?: string[]; // e.g., ['senior', 'family_with_children', 'solo']
  budgetLevel?: 'low' | 'medium' | 'high';
  riskTolerance?: 'low' | 'medium' | 'high';
  relianceOnPhone?: boolean;
  preexistingConditions?: boolean;
}

export interface ItineraryInfo {
  countries: string[]; // ISO country codes
  transitCountries?: string[]; // 过境国家
  transitsMainlandNorway?: boolean; // 特殊：是否过境挪威本土
  activities?: string[]; // e.g., ['snowmobile', 'hiking', 'boat_tour']
  season?: string; // SeasonType
  isTightSchedule?: boolean;
  hasTightConnections?: boolean;
}

export interface TripContext {
  traveler: TravelerProfile;
  trip: {
    startDate?: string; // ISO date
    endDate?: string; // ISO date
  };
  itinerary: ItineraryInfo;
  /** 地理特征（可选，在检查时动态添加） */
  geo?: {
    /** 河网特征 */
    rivers?: {
      nearRiver?: boolean;
      nearestRiverDistanceM?: number;
      riverCrossingCount?: number;
      riverDensityScore?: number;
    };
    /** 山脉特征 */
    mountains?: {
      inMountain?: boolean;
      mountainElevationAvg?: number;
      terrainComplexity?: number;
    };
    /** 道路特征 */
    roads?: {
      nearRoad?: boolean;
      roadDensityScore?: number;
    };
    /** 海岸线特征 */
    coastlines?: {
      nearCoastline?: boolean;
      isCoastalArea?: boolean;
    };
    /** POI 特征 */
    pois?: {
      topPickupPoints?: Array<{ category: string; score: number }>;
      hasHarbour?: boolean;
      trailAccessPoints?: Array<{ poi_id: string; category: string }>;
      hasEVCharger?: boolean;
      hasFerryTerminal?: boolean;
    };
    /** 纬度（用于极地判断） */
    latitude?: number;
    /** 西藏特有特征 */
    altitude_m?: number; // 平均海拔（米）
    fuelDensity?: number; // 燃料密度（每 100km 的加油站数量）
    checkpointCount?: number; // 检查站数量
    mountainPassCount?: number; // 山口/垭口数量
    oxygenStationCount?: number; // 氧气点数量
  };
}

/**
 * 辅助函数：判断是否需要申根签证
 * 这是一个简化的判断，实际应该查询签证政策表
 */
export function requiresSchengenVisa(nationality?: string): boolean {
  // 申根区国家列表（简化版，实际应该从数据库查询）
  const schengenCountries = [
    'AT', 'BE', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
    'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
    'PT', 'SK', 'SI', 'ES', 'SE', 'CH'
  ];
  
  if (!nationality) return false;
  return !schengenCountries.includes(nationality.toUpperCase());
}

