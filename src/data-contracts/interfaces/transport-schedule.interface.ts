// src/data-contracts/interfaces/transport-schedule.interface.ts

/**
 * 公共交通时刻表标准接口
 * 
 * 所有交通数据源（SBB、Navitime、Yahoo Transit 等）都必须转换为这个标准格式
 */
export interface TransportSchedule {
  /** 路线标识 */
  route: string;
  
  /** 路线名称（可选） */
  routeName?: string;
  
  /** 出发站 */
  from: {
    name: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 到达站 */
  to: {
    name: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 发车时刻列表 */
  departures: DepartureTime[];
  
  /** 最后更新时间 */
  lastUpdated: Date;
  
  /** 数据源标识（如 'sbb', 'navitime', 'yahoo-transit', 'default'） */
  source: string;
  
  /** 额外元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * 发车时刻
 */
export interface DepartureTime {
  /** 发车时间（ISO 8601 datetime） */
  departureTime: string;
  
  /** 到达时间（ISO 8601 datetime，可选） */
  arrivalTime?: string;
  
  /** 运行时长（分钟，可选） */
  durationMinutes?: number;
  
  /** 是否需要预订（可选） */
  requiresReservation?: boolean;
  
  /** 价格信息（可选） */
  price?: {
    amount: number;
    currency: string;
    currencyCode: string;
  };
  
  /** 状态（如 'scheduled', 'delayed', 'cancelled'） */
  status?: 'scheduled' | 'delayed' | 'cancelled' | 'unknown';
  
  /** 延迟时间（分钟，可选） */
  delayMinutes?: number;
  
  /** 平台/站台（可选） */
  platform?: string;
}

/**
 * 交通查询请求
 */
export interface TransportQuery {
  /** 出发站 */
  from: {
    name?: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 到达站 */
  to: {
    name?: string;
    code?: string;
    coordinates?: { lat: number; lng: number };
  };
  
  /** 出发日期时间（ISO 8601，可选） */
  departureDateTime?: string;
  
  /** 查询数量限制（可选） */
  limit?: number;
}

