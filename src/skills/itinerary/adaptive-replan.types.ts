/**
 * itinerary.adaptive_replan — 自适应改排 Skill 合同
 *
 * 承载物理约束（距离、营业时间、天气、路况）与人格约束（Odyssey Persona、疲劳、节奏）
 * 的多模态融合输入/输出。
 */

import type { Itinerary, RequiredAdjustment } from '../../agent/interfaces/trip-plan.interface';
import type { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import type { ItineraryAdjustOptimizationResult } from '../../agent/utils/itinerary-adjust-optimization-summary.util';
import type { ItinerarySmartUpdateOutput } from './itinerary-smart-update.skill';

/** 结构化编辑项（与 trip.applyEdit db 模式对齐） */
export interface StructuredEditItem {
  action: 'add' | 'delete' | 'update' | 'move';
  day_number?: number;
  item_id?: string;
  poi_id?: string;
  start_window?: string;
  end_window?: string;
  notes?: string;
}

export interface WeatherSnapshot {
  date_iso: string;
  condition: string;
  severity?: 'low' | 'moderate' | 'high' | 'extreme';
  precipitation_mm?: number;
  wind_speed_ms?: number;
  visibility_m?: number;
}

/** 路段通行状态矩阵（冰岛 F-Road / 封路场景） */
export interface TrafficMatrixEntry {
  from_place_id?: string;
  to_place_id?: string;
  from_coords?: { lat: number; lng: number };
  to_coords?: { lat: number; lng: number };
  /** 基础驾驶分钟数（无干扰） */
  base_drive_minutes: number;
  /** 路况干扰系数 F_traffic ≥ 1.0 */
  traffic_factor: number;
  blocked?: boolean;
  block_reason?: string;
}

export type TrafficMatrix = TrafficMatrixEntry[];

export type OdysseyTravelStyle =
  | 'deep_privacy'
  | 'efficiency_first'
  | 'leisure_chill'
  | 'adventure';

export type SocialBoundary = 'absolute_privacy' | 'standard' | 'open';

export interface OdysseyPersonaSnapshot {
  travelStyle: OdysseyTravelStyle;
  energyModel: {
    /** 0–100，当前疲劳度 */
    currentFatigueLevel: number;
    maxDailyPoiCount: number;
    /** 换乘与空白留白比例（1.2 = 多留 20% 时间） */
    bufferRatio: number;
  };
  socialBoundary: SocialBoundary;
}

export interface AdaptiveReplanEnvironmentalContext {
  weatherForecast?: WeatherSnapshot[];
  trafficStatus?: TrafficMatrix;
}

export interface AdaptiveReplanPayload {
  tripId: string;
  /** 影响的日历日序号，如 [2] 代表第 2 天 */
  targetDays: number[];

  userIntent?: string;
  structuredEdits?: StructuredEditItem[];

  environmentalContext?: AdaptiveReplanEnvironmentalContext;
  personaSnapshot: OdysseyPersonaSnapshot;

  /** 可选：已有行程草案（缺省时由 trip.load 补水） */
  itinerary?: Itinerary;
  research_data?: Record<string, unknown>;
  world?: WorldModelContext;
  route_plan_draft?: RoutePlanDraft;
}

/** 人格 → 约束权重（Stage 1 输出） */
export interface PersonaConstraintWeights {
  bufferRatio: number;
  maxDailyPoiCount: number;
  earliestStartLocal: string;
  insertRestBlock: boolean;
  restBlockWindow?: { start: string; end: string };
  preferLowCrowd: boolean;
  weatherTolerance: 'low' | 'medium' | 'high';
  structuralThinning: boolean;
  trafficFactorMultiplier: number;
}

export interface ConstraintParseResult {
  weights: PersonaConstraintWeights;
  weatherRiskByDay: Record<string, Array<{ item_id?: string; poi_name: string; risk: string }>>;
  blockedSegments: TrafficMatrixEntry[];
  adjustments: RequiredAdjustment[];
}

export interface CorridorFilterResult {
  itinerary: Itinerary;
  demoted_poi_ids: string[];
  removed_item_ids: string[];
  rationale_zh: string[];
}

export interface PersonaRearrangeResult {
  itinerary: Itinerary;
  inserted_rest_blocks: number;
  thinned_item_ids: string[];
  rationale_zh: string[];
}

export interface AdaptiveReplanPhaseTelemetry {
  ok: boolean;
  duration_ms: number;
  error?: string;
  skipped_reason?: string;
}

export interface AdaptiveReplanOutput {
  itinerary: Itinerary;
  verified: boolean;
  /** 供工作台 `payload.itinerary_adjust_result` 组装的草案摘要（由编排层 enrich） */
  adjust_result_hints?: Partial<ItineraryAdjustOptimizationResult>;
  constraint_parse?: ConstraintParseResult;
  corridor_filter?: CorridorFilterResult;
  persona_rearrange?: PersonaRearrangeResult;
  smart_update?: ItinerarySmartUpdateOutput;
  telemetry: {
    constraint_parse: AdaptiveReplanPhaseTelemetry;
    corridor_filter: AdaptiveReplanPhaseTelemetry;
    persona_rearrange: AdaptiveReplanPhaseTelemetry;
    verify_repair: AdaptiveReplanPhaseTelemetry;
    narrative: string;
  };
}
