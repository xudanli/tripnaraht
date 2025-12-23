// src/data-contracts/interfaces/iceland-specific.interface.ts

/**
 * 冰岛特定数据接口
 * 
 * 包含 F-Road、河流渡口、保险规则等冰岛特有的数据
 */

/**
 * F-Road（高地公路）信息
 */
export interface FRoadInfo {
  /** 道路编号（如 'F910', 'F35'） */
  roadNumber: string;
  
  /** 是否为 F-Road */
  isFRoad: boolean;
  
  /** 道路状态 */
  status: 'open' | 'closed' | 'restricted' | 'unknown';
  
  /** 限制原因（可选） */
  restrictionReason?: string;
  
  /** 是否需要 4WD（四驱车） */
  requires4WD: boolean;
  
  /** 当前路况难度（1-5，5 最难） */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
  
  /** 积雪深度（厘米，可选） */
  snowDepth?: number;
  
  /** 是否湿滑 */
  isSlippery?: boolean;
  
  /** 最后更新时间 */
  lastUpdated: Date;
}

/**
 * 河流渡口信息
 */
export interface RiverCrossingInfo {
  /** 渡口位置 */
  location: {
    lat: number;
    lng: number;
    name?: string;
  };
  
  /** 河流名称 */
  riverName?: string;
  
  /** 当前水位（米） */
  waterLevel?: number;
  
  /** 安全水位阈值（米） */
  safeWaterLevel?: number;
  
  /** 是否可通行 */
  isPassable: boolean;
  
  /** 风险等级：0=安全, 1=轻微风险, 2=中等风险, 3=高风险 */
  riskLevel: 0 | 1 | 2 | 3;
  
  /** 风险原因 */
  riskReason?: string;
  
  /** 最近降水记录（毫米，可选） */
  recentPrecipitation?: number;
  
  /** 最后更新时间 */
  lastUpdated: Date;
}

/**
 * 租车保险信息
 */
export interface CarRentalInsurance {
  /** 保险类型 */
  type: 'SAAP' | 'GP' | 'SCDW' | 'BASIC';
  
  /** 保险名称 */
  name: string;
  
  /** 是否已购买 */
  isPurchased: boolean;
  
  /** 保险描述 */
  description?: string;
}

/**
 * 路径风险评估
 */
export interface RouteRiskAssessment {
  /** 路径 ID */
  routeId: string;
  
  /** 总风险等级：0=安全, 1=轻微风险, 2=中等风险, 3=高风险 */
  overallRiskLevel: 0 | 1 | 2 | 3;
  
  /** 风险原因列表 */
  riskReasons: string[];
  
  /** F-Road 占比（百分比） */
  fRoadPercentage: number;
  
  /** 碎石路面占比（百分比） */
  gravelRoadPercentage: number;
  
  /** 是否包含 F-Road */
  containsFRoad: boolean;
  
  /** 是否包含河流渡口 */
  containsRiverCrossing: boolean;
  
  /** 保险建议 */
  insuranceRecommendations: string[];
  
  /** 路径段风险评估 */
  segmentRisks: Array<{
    segmentId: string;
    riskLevel: 0 | 1 | 2 | 3;
    riskReason: string;
    fRoadInfo?: FRoadInfo;
    riverCrossingInfo?: RiverCrossingInfo;
  }>;
}

/**
 * 冰岛安全警报
 */
export interface IcelandSafetyAlert {
  /** 警报 ID */
  id: string;
  
  /** 警报类型 */
  type: 'weather' | 'road' | 'volcano' | 'glacier' | 'geothermal' | 'general';
  
  /** 严重程度 */
  severity: 'info' | 'warning' | 'critical';
  
  /** 标题 */
  title: string;
  
  /** 描述 */
  description: string;
  
  /** 影响区域 */
  affectedAreas?: Array<{
    name: string;
    coordinates?: { lat: number; lng: number };
  }>;
  
  /** 生效时间 */
  effectiveTime: Date;
  
  /** 过期时间 */
  expiryTime?: Date;
  
  /** 数据源 */
  source: 'safetravel' | 'vedur' | 'road.is';
  
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

