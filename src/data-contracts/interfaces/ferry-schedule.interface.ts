// src/data-contracts/interfaces/ferry-schedule.interface.ts

/**
 * 轮渡时刻表标准接口
 * 
 * 所有轮渡数据源（挪威轮渡、智利轮渡等）都必须转换为这个标准格式
 */
export interface FerrySchedule {
  /** 轮渡路线标识 */
  route: string;
  
  /** 路线名称（可选） */
  routeName?: string;
  
  /** 出发港口 */
  from: {
    name: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 到达港口 */
  to: {
    name: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 班次列表 */
  sailings: FerrySailing[];
  
  /** 最后更新时间 */
  lastUpdated: Date;
  
  /** 数据源标识（如 'norway-ferry', 'chile-ferry', 'default'） */
  source: string;
  
  /** 额外元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * 轮渡班次
 */
export interface FerrySailing {
  /** 出发时间（ISO 8601 datetime） */
  departureTime: string;
  
  /** 到达时间（ISO 8601 datetime，可选） */
  arrivalTime?: string;
  
  /** 航行时长（分钟，可选） */
  durationMinutes?: number;
  
  /** 是否需要预订（可选） */
  requiresReservation?: boolean;
  
  /** 价格信息（可选） */
  price?: {
    amount: number;
    currency: string;
    currencyCode: string;
    vehicleIncluded?: boolean; // 是否包含车辆
  };
  
  /** 状态（如 'scheduled', 'delayed', 'cancelled', 'full'） */
  status?: 'scheduled' | 'delayed' | 'cancelled' | 'full' | 'unknown';
  
  /** 延迟时间（分钟，可选） */
  delayMinutes?: number;
  
  /** 可用性（可选） */
  availability?: {
    vehicles?: number; // 剩余车辆位置
    passengers?: number; // 剩余乘客位置
  };
  
  /** 船舶信息（可选） */
  vessel?: {
    name?: string;
    capacity?: number;
  };
}

/**
 * 轮渡查询请求
 */
export interface FerryQuery {
  /** 出发港口 */
  from: {
    name?: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 到达港口 */
  to: {
    name?: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 出发日期时间（ISO 8601，可选） */
  departureDateTime?: string;
  
  /** 是否包含车辆（可选） */
  withVehicle?: boolean;
  
  /** 查询数量限制（可选） */
  limit?: number;
}

