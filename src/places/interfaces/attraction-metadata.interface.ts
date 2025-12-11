// src/places/interfaces/attraction-metadata.interface.ts

/**
 * 景点完整元数据接口定义
 * 
 * 对应6大类42个字段的完整结构
 */

// ============================================
// 一、基础结构字段
// ============================================

export interface BasicMetadata {
  /** 景点类型 */
  type?: 'NATURAL' | 'CULTURAL' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'OTHER';
  
  /** 开放时间 */
  openingHours?: {
    weekday?: { open: string; close: string };
    weekend?: { open: string; close: string };
    special?: Array<{ date: string; open: string; close: string }>;
    timezone?: string;
    note?: string; // 如"周一闭馆"
  };
  
  /** 门票价格 */
  ticketPrice?: {
    adult?: number;
    child?: number;
    senior?: number;
    student?: number;
    currency?: string;
    free?: boolean;
    note?: string;
  };
  
  /** 联系方式 */
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
    wechat?: string;
    weibo?: string;
  };
  
  /** 官方网址（用于自动更新） */
  officialWebsite?: string;
}

// ============================================
// 二、体验与属性特征字段
// ============================================

export interface ExperienceMetadata {
  /** 亮点关键词（结构化标签 + 权重） */
  highlights?: Array<{
    keyword: string;
    weight: number; // 0-1，重要性权重
    category?: 'SCENERY' | 'CULTURE' | 'ACTIVITY' | 'FOOD' | 'PHOTO';
  }>;
  
  /** 氛围标签 */
  atmosphere?: Array<'ROMANTIC' | 'QUIET' | 'LIVELY' | 'SERENE' | 'URBAN' | 'NATURAL'>;
  
  /** 适合人群 */
  suitableFor?: Array<'FAMILY' | 'COUPLE' | 'SENIOR' | 'SOLO' | 'FRIENDS' | 'BUSINESS'>;
  
  /** 兴趣匹配度向量（0-1数组） */
  interestVector?: {
    history?: number;
    nature?: number;
    photography?: number;
    food?: number;
    shopping?: number;
    adventure?: number;
    culture?: number;
    relaxation?: number;
  };
  
  /** 步行强度（1-5） */
  walkingIntensity?: 1 | 2 | 3 | 4 | 5;
  
  /** 体力要求 */
  physicalRequirement?: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 地形信息 */
  terrain?: {
    type?: 'FLAT' | 'SLOPE' | 'STAIRS' | 'MIXED';
    wheelchairAccessible?: boolean;
    strollerFriendly?: boolean;
    difficulty?: 'EASY' | 'MODERATE' | 'HARD';
  };
  
  /** 预计花费 */
  estimatedCost?: {
    min?: number;
    max?: number;
    currency?: string;
    includes?: string[];
  };
  
  /** 是否有付费项目 */
  hasPaidActivities?: boolean;
  paidActivities?: Array<{
    name: string;
    price: number;
    currency?: string;
  }>;
}

// ============================================
// 三、约束字段
// ============================================

export interface ConstraintMetadata {
  /** 人流拥挤度 */
  crowdLevel?: {
    current?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    predicted?: {
      weekday?: 'LOW' | 'MEDIUM' | 'HIGH';
      weekend?: 'LOW' | 'MEDIUM' | 'HIGH';
      peakHours?: string[];
    };
    lastUpdated?: string;
  };
  
  /** 排队时间预测 */
  queueTime?: {
    average?: number; // 分钟
    peak?: number;
    prediction?: {
      weekday?: number;
      weekend?: number;
      peakHours?: number;
    };
  };
  
  /** 天气敏感度 */
  weatherSensitivity?: {
    heat?: 'LOW' | 'MEDIUM' | 'HIGH';
    rain?: 'LOW' | 'MEDIUM' | 'HIGH';
    wind?: 'LOW' | 'MEDIUM' | 'HIGH';
    indoor?: boolean;
    covered?: boolean;
  };
  
  /** 安全指数 */
  safety?: {
    index?: number; // 1-10
    nightSafe?: boolean;
    remote?: boolean;
    lighting?: 'GOOD' | 'MODERATE' | 'POOR';
    security?: 'GOOD' | 'MODERATE' | 'POOR';
  };
  
  /** 容量限制、是否需要预约 */
  capacity?: {
    maxVisitors?: number;
    requiresReservation?: boolean;
    reservationUrl?: string;
    reservationPhone?: string;
    walkInAllowed?: boolean;
  };
  
  /** 风险提示 */
  risks?: Array<{
    type: 'CONSTRUCTION' | 'CLOSED_AREA' | 'WEATHER' | 'CROWD' | 'OTHER';
    description: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH';
    startDate?: string;
    endDate?: string;
    affectedAreas?: string[];
  }>;
}

// ============================================
// 四、时间相关字段
// ============================================

export interface TimeMetadata {
  /** 建议游玩时长 */
  recommendedDuration?: {
    min?: number; // 分钟
    max?: number;
    typical?: number;
    byActivity?: Array<{
      activity: string;
      duration: number;
    }>;
  };
  
  /** 不同区域的停留时长 */
  areaDurations?: Array<{
    area: string;
    minDuration: number;
    maxDuration: number;
    mustSee?: boolean;
  }>;
  
  /** 最佳参观时间段 */
  bestVisitTime?: {
    timeOfDay?: Array<'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT'>;
    specificTime?: string; // 如"日落前1小时"
    reason?: string;
    seasonal?: Array<{
      season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
      bestTime: string;
    }>;
  };
  
  /** 项目时间表（演出、活动） */
  schedule?: Array<{
    name: string;
    type: 'SHOW' | 'ACTIVITY' | 'EVENT' | 'GUIDED_TOUR';
    times: Array<{
      weekday?: string[];
      weekend?: string[];
      special?: Array<{ date: string; times: string[] }>;
    }>;
    duration?: number;
    requiresBooking?: boolean;
  }>;
  
  /** 高峰时段预测 */
  peakHours?: {
    weekday?: string[];
    weekend?: string[];
    holiday?: string[];
  };
}

// ============================================
// 五、交通与路径字段
// ============================================

export interface TransportMetadata {
  /** 最近交通站点 */
  nearestStations?: Array<{
    type: 'SUBWAY' | 'BUS' | 'TRAIN' | 'TAXI' | 'PARKING';
    name: string;
    distance?: number; // 米
    walkTime?: number; // 分钟
    coordinates?: { lat: number; lng: number };
  }>;
  
  /** 步行时间 */
  walkTime?: {
    fromSubway?: number;
    fromBus?: number;
    fromParking?: number;
  };
  
  /** 驾车时间 */
  driveTime?: {
    fromCityCenter?: number;
    fromAirport?: number;
    fromTrainStation?: number;
  };
  
  /** 公交/地铁可达性 */
  publicTransport?: {
    accessible?: boolean;
    lines?: Array<{
      type: 'SUBWAY' | 'BUS';
      line: string;
      station: string;
      walkTime?: number;
    }>;
    frequency?: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  
  /** 停车信息 */
  parking?: {
    available?: boolean;
    type?: 'FREE' | 'PAID' | 'STREET' | 'GARAGE';
    price?: {
      perHour?: number;
      perDay?: number;
      currency?: string;
    };
    capacity?: number;
    note?: string;
  };
  
  /** 从景点到其他景点的平均通达时间（缓存） */
  transitTimeCache?: Record<string, {
    walkTime?: number;
    driveTime?: number;
    publicTransportTime?: number;
    lastUpdated?: string;
  }>;
}

// ============================================
// 六、AI用户匹配字段
// ============================================

export interface AIMetadata {
  /** 与不同用户画像的相似度评分 */
  userProfileScores?: Record<string, number>;
  
  /** Keywords embedding（语义向量） */
  embedding?: number[];
  embeddingModel?: string;
  
  /** 场景适配度 */
  scenarioFit?: {
    halfDay?: number;
    fullDay?: number;
    familyTrip?: number;
    coupleTrip?: number;
    soloTrip?: number;
    businessTrip?: number;
  };
  
  /** 推荐理由模板 */
  recommendationReasons?: Array<{
    profile: string;
    reason: string;
    score: number;
  }>;
}

// ============================================
// 完整元数据接口（整合所有类别）
// ============================================

export interface AttractionMetadata {
  /** 基础结构字段 */
  basic?: BasicMetadata;
  
  /** 体验与属性特征 */
  experience?: ExperienceMetadata;
  
  /** 约束字段 */
  constraints?: ConstraintMetadata;
  
  /** 时间相关字段 */
  time?: TimeMetadata;
  
  /** 交通与路径字段 */
  transport?: TransportMetadata;
  
  /** AI用户匹配字段 */
  ai?: AIMetadata;
}
