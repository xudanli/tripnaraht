// src/data-contracts/interfaces/road-status.interface.ts

/**
 * 路况状态标准接口
 * 
 * 所有路况数据源（冰岛 Road.is、Google Traffic 等）都必须转换为这个标准格式
 */
export interface RoadStatus {
  /** 道路是否开放 */
  isOpen: boolean;
  
  /** 风险等级：0=安全, 1=轻微风险, 2=中等风险, 3=高风险/危险 */
  riskLevel: 0 | 1 | 2 | 3;
  
  /** 风险原因（可选） */
  reason?: string;
  
  /** 最后更新时间 */
  lastUpdated: Date;
  
  /** 数据源标识（如 'road.is', 'google-traffic', 'default'） */
  source: string;
  
  /** 额外元数据（可选，用于存储原始数据源的特定信息） */
  metadata?: Record<string, any>;
}

/**
 * 路段信息
 */
export interface RoadSegment {
  /** 起点坐标 */
  from: { lat: number; lng: number };
  
  /** 终点坐标 */
  to: { lat: number; lng: number };
  
  /** 路况状态 */
  status: RoadStatus;
  
  /** 路段名称（可选） */
  name?: string;
}

/**
 * 批量查询路况请求
 */
export interface RoadStatusQuery {
  /** 查询点坐标 */
  lat: number;
  lng: number;
  
  /** 查询半径（米，可选） */
  radius?: number;
  
  /** 路段查询（可选） */
  segments?: Array<{
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  }>;
  
  /** 冰岛特定：是否包含 F-Road 信息 */
  includeFRoadInfo?: boolean;
  
  /** 冰岛特定：是否包含河流渡口信息 */
  includeRiverCrossing?: boolean;
}

/**
 * 扩展的路况状态（包含冰岛特定信息）
 */
export interface ExtendedRoadStatus extends RoadStatus {
  /** 冰岛特定：F-Road 信息（可选） */
  fRoadInfo?: import('./iceland-specific.interface').FRoadInfo;
  
  /** 冰岛特定：河流渡口信息（可选） */
  riverCrossingInfo?: import('./iceland-specific.interface').RiverCrossingInfo;
  
  /** 冰岛特定：积雪深度（厘米，可选） */
  snowDepth?: number;
  
  /** 冰岛特定：瞬时强风（米/秒，可选） */
  windGusts?: number;
}

