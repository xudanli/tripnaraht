/**
 * itinerary.experience_align — 旅行体验对齐 Skill 合同
 *
 * 与 adaptive_replan（物理约束+人格）正交：专注节奏弧线、体验多样性、情绪摩擦与惊喜留白。
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { ExperienceFlowModel } from '../../trips/decision/models/experience-flow.model';
import type { OdysseyPersonaSnapshot } from './adaptive-replan.types';

export type ExperiencePoiCategory =
  | 'waterfall'
  | 'beach_coast'
  | 'glacier_ice'
  | 'museum_indoor'
  | 'hotspring_spa'
  | 'town_stroll'
  | 'hike_outdoor'
  | 'food_cafe'
  | 'other';

export interface ExperienceAlignScoreBreakdown {
  /** 0–100：全日节奏弧线（启-承-转-合） */
  rhythm_arc: number;
  /** 0–100：品类/景观多样性 */
  diversity: number;
  /** 0–100：转场摩擦可承受度 */
  friction_budget: number;
  /** 0–100：休息与留白质量 */
  rest_quality: number;
  /** 0–100 综合体验分 */
  overall: number;
}

export interface ExperienceAlignInsight {
  dimension: keyof Omit<ExperienceAlignScoreBreakdown, 'overall'>;
  severity: 'info' | 'suggestion' | 'warning';
  message_zh: string;
}

export interface ExperienceAlignCraftResult {
  itinerary: Itinerary;
  insights_zh: string[];
  inserted_meal_blocks: number;
  reordered_item_ids: string[];
}

export interface ExperienceAlignInput {
  itinerary: Itinerary;
  targetDays: number[];
  userIntent?: string;
  experienceFlow?: ExperienceFlowModel;
  personaSnapshot?: OdysseyPersonaSnapshot;
  research_data?: Record<string, unknown>;
}

export interface ExperienceAlignOutput {
  itinerary: Itinerary;
  score: ExperienceAlignScoreBreakdown;
  insights: ExperienceAlignInsight[];
  insights_zh: string[];
  craft?: ExperienceAlignCraftResult;
  experience_flow_tempo?: string;
  telemetry: {
    duration_ms: number;
    narrative: string;
  };
}
