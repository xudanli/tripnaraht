/**
 * Iceland Driving Operations OS — shared output contracts (P0 infra layer).
 * Planner / route feasibility should consume these shapes instead of ad-hoc strings.
 */

import type { SkillOutput } from '../interfaces/skill.interface';

export type FRoadInfraStatus = 'open' | 'closed' | 'snow_covered' | 'impassable';

export interface FRoadStatus {
  roadId: string;
  status: FRoadInfraStatus;
  requires4x4: boolean;
  riverCrossing: boolean;
  camperRestricted: boolean;
  confidence: number;
}

export type NightDrivingRiskLevel = 'low' | 'medium' | 'high';

/** 民用晨昏蒙影跨度驱动的季节带（用于 routeFeasibility 是否收紧「日照里程」） */
export type IcelandDaylightRegime = 'normal' | 'polar_night' | 'midnight_sun';

/**
 * 极昼：日照稀缺不构成约束 → NONE；极夜/短日：与 nightDrivingRisk 对齐为 HIGH 等。
 */
export type IcelandDaylightRiskBand = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface IcelandDaylightWindowOutput {
  daylightHours: number;
  /** dawn–dusk 民用晨昏蒙影时长（小时） */
  civilTwilightHours: number;
  safeDrivingWindow: { start: string; end: string };
  nightDrivingRisk: NightDrivingRiskLevel;
  daylightRegime: IcelandDaylightRegime;
  /** 极昼为 true：复合裁决器应忽略「驾驶时长 vs 晨昏窗」紧耦合 */
  temporalMileageUnbounded: boolean;
  daylightRisk: IcelandDaylightRiskBand;
  /** ISO 8601 in Atlantic/Reykjavik — optional enrichments for planners */
  sunrise?: string;
  sunset?: string;
  goldenHourStart?: string;
  goldenHourEnd?: string;
}

export type CrosswindRiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface IcelandWindRiskOutput {
  region: string;
  crosswindRisk: CrosswindRiskLevel;
  campervanWarning: boolean;
  dangerousSegments: string[];
  /** m/s — max hourly in evaluation window when available */
  maxWindMps?: number;
}

export type TravelOperationalRisk = 'safe' | 'caution' | 'dangerous' | 'avoid_nonessential';

export interface IcelandWeatherSeverityClassifierOutput {
  travelRisk: TravelOperationalRisk;
  drivingRecommendation: string[];
}

/** ---- Route feasibility (P1 world constraint arbiter) ---- */

export type FeasibilityRiskLevel = 'SAFE' | 'CAUTION' | 'HIGH' | 'DANGEROUS';

export type FeasibilityBlockedReason =
  | 'VEHICLE_TYPE_INCOMPATIBLE'
  | 'ROAD_CLOSED'
  | 'ROAD_IMPASSABLE'
  | 'ROAD_SNOW_COVERED_2WD'
  | 'CAMPER_FR_RESTRICTED'
  | 'WIND_CAMPERVAN_EXTREME'
  | 'WEATHER_SEVERITY_BLOCK';

export type FeasibilityAdjustmentCode =
  | 'REDUCE_DAILY_MILEAGE'
  | 'START_BEFORE_DAWN'
  | 'DEFER_TO_DAYLIGHT'
  | 'PROVIDE_EXACT_DISTANCES'
  | 'REVIEW_WIND_EXPOSURE'
  | 'REVIEW_WEATHER'
  | 'NIGHT_DRIVING_REQUIRED'
  | 'EXTEND_STAY_DAYS'
  /** 西峡湾单向隧道网（Vestfjarðagöng 等）：会让行、错车湾 — 见 iceland.tunnelProtocol */
  | 'REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL'
  /** 标注 gravel 路段时：碎石击伤、租车条款与 GP/SAAP 类承保 — 见 iceland.roadSurfaceAlerts */
  | 'REVIEW_GRAVEL_PROTECTION_INSURANCE';

export interface IcelandRouteFeasibilitySegment {
  from_region: string;
  to_region: string;
  /** 若该段含 F-road，填编号如 F208（用于 iceland.fRoadStatus） */
  roadId?: string;
  /** 若有地图/里程表优先传入；缺省则用区域启发式或保守默认 */
  distanceKm?: number;
  /**
   * 路面语义（西峡湾 / 高地碎石等）；用于能耗等价里程（energyPlanningKm），不替代 F-road 裁决。
   * `mixed` 使用介于铺装与纯碎石之间的保守系数。
   */
  surface?: 'paved' | 'gravel' | 'mixed';
}

export type IcelandRouteFeasibilityVehicleType = '4x4' | '2wd' | 'campervan';

export interface IcelandRouteFeasibilityVehicle {
  type: IcelandRouteFeasibilityVehicleType;
  model?: string;
}

/** P1 gas/EV planner 的粗输入（启发式，非实测油耗） */
export interface IcelandRouteEnergyDemandEstimate {
  totalKm: number;
  /**
   * 用于补给/续航粗算的有效里程（≥ totalKm）；含碎石等 surface 加权时大于地理里程。
   * Gas planner 优先使用本字段，缺省则回退 totalKm。
   */
  energyPlanningKm?: number;
  /** 汽油当量升数（房车/四驱/两驱不同粗系数） */
  estimatedFuelLitersGasolineEquiv: number;
  /** 纯电粗算 kWh（~20 kWh/100km 档） */
  estimatedEvKwh: number;
  /** 可观测的模型标签，便于回归与替换为实测曲线 */
  fuelBurnModelId: string;
}

/** P1：冰岛补给 / 充电 v0 生存审计输出 */
export interface IcelandGasEvRecommendedStop {
  station_id: string;
  name: string;
  kind: string;
  match_reason: string;
}

export interface IcelandGasEvPlannerOutput extends SkillOutput {
  feasible: boolean;
  refuel_or_charge_required: boolean;
  critical_segment?: string;
  must_refill_before?: { station_id: string; warning: string };
  recommended_stops: IcelandGasEvRecommendedStop[];
  safety_alerts: string[];
  metrics: {
    energy_mode: 'ice' | 'ev';
    vehicle_class: string;
    total_km: number;
    estimated_consumption_l_or_kwh: number;
    usable_capacity_l_or_kwh: number;
    nominal_range_km: number;
    range_anxiety_threshold_km: number;
  };
}

/** Vestfjarðagöng / 西峡湾单向隧道 — 与 iceland.tunnelProtocol 对齐 */
export const VESTFJARDAR_TUNNEL_PROTOCOL_CODE = 'REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL' as const;

export interface IcelandRouteTunnelProtocolSummary {
  triggered: boolean;
  protocolCode?: typeof VESTFJARDAR_TUNNEL_PROTOCOL_CODE;
  drivingNotes: string[];
  affectedSegments: string[];
}

/** 碎石路面 — 与 iceland.roadSurfaceAlerts 对齐 */
export const GRAVEL_PROTECTION_INSURANCE_CODE = 'REVIEW_GRAVEL_PROTECTION_INSURANCE' as const;

export interface IcelandRouteRoadSurfaceAlertsSummary {
  triggered: boolean;
  protocolCode?: typeof GRAVEL_PROTECTION_INSURANCE_CODE;
  drivingNotes: string[];
  /** 仅 `surface === 'gravel'` 且两端预设可解析的路段标签 */
  affectedSegments: string[];
}

export interface IcelandRouteFeasibilityOutput extends SkillOutput {
  feasible: boolean;
  riskLevel: FeasibilityRiskLevel;
  blockedReasons: FeasibilityBlockedReason[];
  recommendedAdjustments: FeasibilityAdjustmentCode[];
  /** 与 iceland.daylightWindow 对齐的锚点日照摘要（可观测） */
  daylightSummary: {
    regime: IcelandDaylightRegime;
    daylightRisk: IcelandDaylightRiskBand;
    temporalMileageUnbounded: boolean;
    civilTwilightHours: number;
    daylightHours: number;
  };
  constraints: {
    mustLeaveBy: string;
    safeDrivingWindowEnd: string;
    safeDrivingWindowHours: number;
    estimatedDrivingHours: number;
    /** 进入裁决矩阵的有效晨昏驾驶小时（极昼下与日照解耦时为 null） */
    effectiveSafeDrivingWindowHours: number | null;
    /** 用于日照裁决的预设区域（偏北 = 更短民用晨昏窗） */
    daylightAnchorRegion: string | null;
    /** 参与天气/横风聚合的预设区域 */
    weatherRegionsAssessed: string[];
    /** 均速假设 km/h */
    assumedAverageSpeedKmh: number;
  };
  energyDemandEstimate: IcelandRouteEnergyDemandEstimate;
  /** 供 MCP / 双审计：西峡湾单向隧道会让行语义（iceland.tunnelProtocol） */
  tunnelProtocol: IcelandRouteTunnelProtocolSummary;
  /** 碎石等路面语义提醒（iceland.roadSurfaceAlerts） */
  roadSurfaceAlerts: IcelandRouteRoadSurfaceAlertsSummary;
  /** 任一段使用了默认里程启发式 */
  usedDistanceHeuristic: boolean;
  /** 供审计：组合了哪些 P0 skill */
  p0SkillsInvoked: string[];
}
