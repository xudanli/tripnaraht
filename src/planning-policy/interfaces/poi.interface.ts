// src/planning-policy/interfaces/poi.interface.ts

/**
 * 开放时间窗口
 */
export interface OpeningHoursWindow {
  /** 星期几（0=周日，1=周一，...，6=周六），如果设置了 holidayDates，则此字段忽略 */
  dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** 开始时间（HH:mm格式） */
  start: string;
  /** 结束时间（HH:mm格式） */
  end: string;
  /** 节假日特殊日期（ISO 格式日期数组，如 ["2026-01-01", "2026-12-25"]），如果设置，则此窗口仅在指定日期生效 */
  holidayDates?: string[];
  /** 是否仅在节假日生效（与 holidayDates 互斥） */
  holidaysOnly?: boolean;
}

/**
 * 开放时间配置
 */
export interface OpeningHours {
  /** 一周内的开放时间窗口 */
  windows: OpeningHoursWindow[];
  /** 最晚入场时间（HH:mm格式，可选） */
  lastEntry?: string;
  /** 最晚入场时间（按星期几区分，可选） */
  lastEntryByDay?: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string>;
  /** 闭馆日期列表（ISO 格式日期数组，如 ["2026-01-01", "2026-12-25"]） */
  closedDates?: string[];
  /** 时区（如 "Asia/Tokyo"），如果未设置，使用地点所在城市的时区 */
  timezone?: string;
}

/** POI 在区域骨架中的角色（区域意图驱动规划） */
export type PoiRoleType = 'anchor' | 'optional' | 'passby';

/** 更适访时段偏好 */
export type VisitTimePreference =
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'any';

/**
 * POI（兴趣点）接口
 * 
 * 最小可用字段清单，用于推荐+可行性+排程
 */
export interface Poi {
  /** POI ID */
  id: string;
  /** POI 名称 */
  name: string;
  /** 别名（检索 / 意图对齐） */
  aliases?: string[];
  /** 纬度 */
  lat: number;
  /** 经度 */
  lng: number;
  /** 标签（标准化：museum/nature/playground/indoor/interactive...） */
  tags: string[];

  /** 所属区域 slug，如 golden_circle（多标签允许跨区引用） */
  regionTags?: string[];
  /** 经典线路/产品标签，如 iceland_classic_day_route */
  routeTags?: string[];

  /** 在区域骨架中的角色；未设置时由检索/规则推断 */
  roleType?: PoiRoleType;
  /** 区域内核心度 0–1 */
  importanceInRegion?: number;

  // 开放时间（建议用结构化，而不是字符串）
  openingHours?: OpeningHours;

  /** 平均游玩时长（分钟） */
  avgVisitMin: number;
  /** 最小停留（分钟），调度下界 */
  minDwellMinutes?: number;
  /** 推荐停留（分钟）；缺省时可用 {@link getEffectiveRecommendedDwellMinutes} */
  recommendedDwellMinutes?: number;
  /** 最大停留（分钟），调度上界 */
  maxDwellMinutes?: number;
  /** 游玩时长标准差（分钟，蒙特卡洛用） */
  visitMinStd?: number;

  /** 排队时间均值（分钟，可先粗估） */
  queueMinMean?: number;
  /** 排队时间标准差（分钟） */
  queueMinStd?: number;

  // 可达性（P0：不做就会频繁不可行）
  /** 是否轮椅可达 */
  wheelchairAccess?: boolean;
  /** 是否必须有楼梯 */
  stairsRequired?: boolean;
  /** 是否有座位可用 */
  seatingAvailable?: boolean;
  /** 附近是否有洗手间 */
  restroomNearby?: boolean;

  // 天气敏感度（下雨/大风体验下降程度）
  /** 天气敏感度（0=不敏感，3=非常敏感） */
  weatherSensitivity?: 0 | 1 | 2 | 3;

  // 热度/拥挤预测 key（可先填空，后续接实时）
  /** 拥挤度预测键（用于接入实时/预测服务） */
  crowdKey?: string;

  /** 更适访时段 */
  visitTimePreference?: VisitTimePreference;

  /** 偏航代价（越大越不应为单点绕路），0–1 归一或工程尺度均可 */
  detourPenalty?: number;

  /** 围绕的主锚点 POI id（optional/pass-by 与骨架关系） */
  connectedAnchorPoiIds?: string[];

  /** 父级区域 slug */
  parentRegion?: string;
}

/**
 * 推荐停留：优先 recommendedDwellMinutes，否则回退 avgVisitMin
 */
export function getEffectiveRecommendedDwellMinutes(poi: Poi): number {
  if (
    poi.recommendedDwellMinutes !== undefined &&
    poi.recommendedDwellMinutes > 0
  ) {
    return poi.recommendedDwellMinutes;
  }
  return poi.avgVisitMin;
}
