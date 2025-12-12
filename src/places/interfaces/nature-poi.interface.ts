// src/places/interfaces/nature-poi.interface.ts

/**
 * 自然 POI 类型定义
 * 
 * 用于统一管理来自不同数据源的自然景点数据：
 * - OSM: 城市点位（教堂、博物馆、餐厅、观景台…）
 * - 冰岛官方自然数据: 火山、熔岩区、冰川、保护区、地质带…
 * - 手工维护: 一些标志性体验点
 */

// ============================================
// 一、基础类型
// ============================================

export type DataSource = 'osm' | 'iceland_lmi' | 'iceland_nsi' | 'manual';

export type GeometryType = 'point' | 'polygon' | 'line';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type AccessType = 'drive' | 'hike' | '4x4' | 'guided_only' | 'boat' | 'unknown';

export type HazardLevel = 'low' | 'medium' | 'high' | 'extreme' | 'unknown';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PoiName {
  primary: string;      // 对用户展示的主名称（一般中文或英文）
  local?: string;       // 当地语言名（冰岛语）
  en?: string;          // 英文名
  zh?: string;          // 中文名（有则存）
}

export interface StayDurationSuggestion {
  minMinutes: number;
  maxMinutes: number;
  recommendedMinutes: number;
}

// ============================================
// 二、基础 POI 结构
// ============================================

export interface BasePoi {
  id: string;                 // 系统内部的ID（可以是 UUID）
  externalId?: string;        // 原始数据源的ID（OSM ID / 官方ID等）
  externalSource: DataSource; // 数据来源
  geometryType: GeometryType; // 原始几何类型（point / polygon / line）
  coordinates: Coordinates;   // 用于路线规划/地图展示的中心点
  bbox?: [number, number, number, number]; // 可选：原始polygon的包围盒 [minLng,minLat,maxLng,maxLat]

  name: PoiName;

  countryCode: string;        // 例如: "IS"
  region?: string;            // 大致区域，如 "South Iceland", "Reykjanes Peninsula"

  // 粗分类：给 TripNARA 用的上层分类
  mainCategory: 'nature' | 'culture' | 'city' | 'activity' | 'accommodation' | 'transport';

  // 细分类（更贴近数据源，但抽象了一层）
  subCategory: string;        // 比如: 'volcano' | 'glacier' | 'lava_field' | 'waterfall' 等

  tags?: string[];            // 自由标签：'photography','hiking','extreme','family-friendly' 等

  // 可选的元数据（原始属性整体塞进来，方便调试/扩展）
  rawProperties?: Record<string, any>;
}

// ============================================
// 三、冰岛自然 POI 专用扩展
// ============================================

export type IcelandNatureSubCategory =
  | 'volcano'
  | 'lava_field'
  | 'geothermal_area'
  | 'hot_spring'
  | 'glacier'
  | 'glacier_lagoon'
  | 'waterfall'
  | 'canyon'
  | 'crater_lake'
  | 'black_sand_beach'
  | 'sea_cliff'
  | 'national_park'
  | 'nature_reserve'
  | 'viewpoint'
  | 'cave'
  | 'coastline'
  | 'other';

export interface IcelandNaturePoi extends BasePoi {
  mainCategory: 'nature'; // 强制 nature

  subCategory: IcelandNatureSubCategory;

  elevationMeters?: number;      // 海拔（方便做观景/天气判断）
  typicalStay?: StayDurationSuggestion;

  // 季节 & 时间段推荐
  bestSeasons?: Season[];        // 如 ['summer','autumn']
  bestTimeOfDay?: ('sunrise' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'night')[];

  // 可达性 & 难度
  accessType?: AccessType;
  trailDifficulty?: ('easy' | 'moderate' | 'hard' | 'expert' | 'unknown');
  requiresGuide?: boolean;       // 是否必须跟团/导游

  // 安全相关
  hazardLevel?: HazardLevel;
  safetyNotes?: string[];        // 简短安全提醒：风大、地热区地面薄、冬季道路结冰等

  // 自然信息（从官方数据来的）
  lastEruptionYear?: number;     // 火山用
  isActiveVolcano?: boolean;
  protectedAreaName?: string;    // 若属于国家公园/自然保护区
}

// ============================================
// 四、NARA 提示信息（给 LLM 用）
// ============================================

export interface NaraHint {
  narrativeSeed?: string;   // 叙事开头：这里是什么样的故事/传说/地质背景
  actionHint?: string;      // 要做什么：步道、拍摄点、体验方式
  reflectionHint?: string;  // 适合思考/感受什么：孤独感、时间尺度、自然力量…
  anchorHint?: string;      // 如何把这次体验和自己的人生/旅程"锚定"
}

export interface IcelandNaturePoiWithNara extends IcelandNaturePoi {
  nara?: NaraHint;
}

// ============================================
// 五、活动映射相关类型
// ============================================

export interface ActivityName {
  chinese?: string;
  english?: string;
  local?: string;
}

export interface ActivityPoiRef {
  source: DataSource;
  externalId?: string;
  subCategory?: string;      // volcano / waterfall / glacier...
  confidence?: number;       // 0-1，匹配置信度
}

export interface ActivityDetails {
  name?: ActivityName;
  address?: string;
  coordinates?: Coordinates;
  poiRef?: ActivityPoiRef;
  tags?: string[];
  naraHint?: NaraHint; // ✅ 添加 NARA 提示
}

export interface TimeSlotActivity {
  time: string;              // "09:30"
  title: string;
  activity: string;          // 有时和 title 一样
  type: string;              // "nature" | "sightseeing" | "hiking" 等
  durationMinutes?: number;
  coordinates?: Coordinates;
  notes?: string;
  details?: ActivityDetails;
}

export interface MapOptions {
  time?: string;             // 默认时间，例如 "09:30"
  template?: 'photoStop' | 'shortWalk' | 'halfDayHike';
  language?: 'zh-CN' | 'en';
}
