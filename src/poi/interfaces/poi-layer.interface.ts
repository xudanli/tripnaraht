// src/poi/interfaces/poi-layer.interface.ts
/**
 * POI 分层接口定义
 * 
 * P2.1: POI 的正确分层
 * 
 * 分层定义：
 * 1. 静态层（STATIC）：基本不变的数据，如地理位置、名称、类型
 * 2. 半动态层（SEMI_DYNAMIC）：定期更新的数据，如开放时间、价格、评分
 * 3. 高度动态层（HIGHLY_DYNAMIC）：实时变化的数据，如实时可用性、拥挤度、天气影响
 */

/**
 * POI 数据层类型
 */
export enum POILayerType {
  /** 静态层：基本不变的数据 */
  STATIC = 'STATIC',
  /** 半动态层：定期更新的数据 */
  SEMI_DYNAMIC = 'SEMI_DYNAMIC',
  /** 高度动态层：实时变化的数据 */
  HIGHLY_DYNAMIC = 'HIGHLY_DYNAMIC',
}

/**
 * 静态层数据（基本不变）
 */
export interface POIStaticData {
  /** POI ID */
  id: string;
  /** 名称 */
  name: string;
  /** 多语言名称 */
  nameI18n?: Record<string, string>;
  /** 地理位置 */
  location: {
    lat: number;
    lng: number;
    geom?: any; // PostGIS geometry
    address?: string;
    regionKey?: string;
    regionName?: string;
  };
  /** 分类 */
  category: string;
  /** 子分类 */
  subCategory?: string;
  /** 标签 */
  tags: string[];
  /** 数据来源 */
  source: string;
  /** 外部ID（如OSM ID） */
  externalId?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * 半动态层数据（定期更新）
 */
export interface POISemiDynamicData {
  /** POI ID（关联静态层） */
  poiId: string;
  /** 开放时间 */
  openingHours?: {
    /** 开放时间字符串（OSM格式） */
    raw?: string;
    /** 结构化开放时间 */
    structured?: {
      [dayOfWeek: string]: Array<{
        open: string; // HH:MM
        close: string; // HH:MM
      }>;
    };
    /** 时区 */
    timezone?: string;
    /** 是否24小时开放 */
    is24Hours?: boolean;
  };
  /** 价格信息 */
  pricing?: {
    /** 价格范围（本地货币） */
    priceRange?: 'free' | 'low' | 'medium' | 'high' | 'very_high';
    /** 具体价格 */
    price?: {
      amount: number;
      currency: string;
      unit?: 'per_person' | 'per_group' | 'per_hour' | 'per_day';
    };
    /** 最后更新时间 */
    updatedAt?: Date;
  };
  /** 评分信息 */
  rating?: {
    /** 平均评分（0-5） */
    average?: number;
    /** 评分数量 */
    count?: number;
    /** 评分来源（如Google, TripAdvisor） */
    source?: string;
    /** 最后更新时间 */
    updatedAt?: Date;
  };
  /** 联系方式 */
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
    socialMedia?: Record<string, string>;
  };
  /** 是否需要预订 */
  requiresBooking?: boolean;
  /** 预订难度（1-5） */
  bookingDifficulty?: number;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * 高度动态层数据（实时变化）
 */
export interface POIHighlyDynamicData {
  /** POI ID（关联静态层） */
  poiId: string;
  /** 实时可用性 */
  availability?: {
    /** 是否开放 */
    isOpen?: boolean;
    /** 是否可用（考虑容量、维护等） */
    isAvailable?: boolean;
    /** 可用容量（百分比） */
    capacityPercentage?: number;
    /** 最后更新时间 */
    updatedAt: Date;
  };
  /** 拥挤度 */
  crowding?: {
    /** 拥挤度等级（0-5） */
    level?: number;
    /** 拥挤度描述 */
    description?: 'empty' | 'quiet' | 'moderate' | 'busy' | 'very_busy' | 'crowded';
    /** 预计等待时间（分钟） */
    estimatedWaitTime?: number;
    /** 数据来源 */
    source?: string;
    /** 最后更新时间 */
    updatedAt: Date;
  };
  /** 天气影响 */
  weatherImpact?: {
    /** 是否受天气影响 */
    isAffected?: boolean;
    /** 影响程度（0-3） */
    impactLevel?: number;
    /** 影响原因 */
    reason?: string;
    /** 最后更新时间 */
    updatedAt: Date;
  };
  /** 实时事件 */
  events?: Array<{
    /** 事件类型 */
    type: 'closure' | 'maintenance' | 'special_event' | 'alert';
    /** 事件描述 */
    description: string;
    /** 开始时间 */
    startTime: Date;
    /** 结束时间 */
    endTime?: Date;
    /** 影响范围 */
    impact?: 'full' | 'partial' | 'minor';
  }>;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * 完整的 POI 数据（包含所有层）
 */
export interface CompletePOIData {
  /** 静态层数据 */
  static: POIStaticData;
  /** 半动态层数据（可选） */
  semiDynamic?: POISemiDynamicData;
  /** 高度动态层数据（可选） */
  highlyDynamic?: POIHighlyDynamicData;
}

/**
 * 用于路线生成的 POI 数据（只包含静态和半动态层）
 */
export interface RouteGenerationPOIData {
  /** 静态层数据 */
  static: POIStaticData;
  /** 半动态层数据（可选） */
  semiDynamic?: POISemiDynamicData;
}

/**
 * POI 数据层元数据
 */
export interface POILayerMetadata {
  /** 层类型 */
  layerType: POILayerType;
  /** 数据来源 */
  source: string;
  /** 更新频率 */
  updateFrequency: 'static' | 'daily' | 'hourly' | 'realtime';
  /** 最后更新时间 */
  lastUpdated: Date;
  /** 数据质量评分（0-100） */
  qualityScore?: number;
  /** 是否可用于路线生成 */
  usableForRouteGeneration: boolean;
}


