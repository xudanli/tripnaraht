/**
 * Planner Draft IR — Travel Compiler 输入契约（v0）
 *
 * AI Planner（PLAN_GEN）产出；Compiler 不直接消费原始自然语言。
 * @see internal-docs/product/travel-compiler-integration-v1.md
 */

import type { EvidenceRef } from '../../agent/interfaces/trip-plan.interface';

export const PLANNER_DRAFT_IR_SCHEMA_ID = 'tripnara.planner_draft_ir@v0';

export type PlannerDraftSource =
  | 'agent_planner'
  | 'guide_import'
  | 'exploration'
  | 'user_edit'
  | 'intent_delta'
  | 'planning_workbench';

export type PlannerSlotHintType =
  | 'poi'
  | 'route'
  | 'route_segment'
  | 'stay'
  | 'activity'
  | 'transport'
  | 'booking'
  | 'meal'
  | 'rest'
  | 'unknown';

export type PlannerTimeHint =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'full_day'
  | 'flexible'
  | string;

/** 词法层识别的单个行程槽位（尚未 canonical） */
export interface PlannerDraftSlot {
  slotId: string;
  rawText: string;
  timeHint?: PlannerTimeHint;
  /** 启发式类型提示；Lexical 阶段可 refine */
  hintType?: PlannerSlotHintType;
  /** 关联 research / planner 证据 */
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}

export interface PlannerDraftDay {
  dayIndex: number;
  date?: string;
  label?: string;
  slots: PlannerDraftSlot[];
}

export interface PlannerDraftDestination {
  countryCode: string;
  region?: string;
  displayName?: string;
}

/**
 * Compiler 统一输入。
 * 可由 Itinerary 投影（`itineraryToPlannerDraftIr`）或由 PLAN_GEN 直接产出。
 */
export interface PlannerDraftIR {
  schemaId: typeof PLANNER_DRAFT_IR_SCHEMA_ID;
  compileRequestId: string;
  tripId?: string;
  requestId?: string;
  source: PlannerDraftSource;
  destination: PlannerDraftDestination;
  days: PlannerDraftDay[];
  /** 全局证据索引（与 TripPlanRequest / Research 对齐） */
  evidenceCatalog?: EvidenceRef[];
  locale?: string;
  createdAt: string;
}
