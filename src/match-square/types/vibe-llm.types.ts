/** PRD 4.3 — Vibe LLM 动态意图解析结构化输出 */

import type { TravelMode, TripMoodTag } from './match-square.types';
import type { TrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.types';
import type { RouteTemplateIntentMatchPlan } from './route-template-intent.types';

export type VibeTeamworkContractModel = 'Full-Service' | 'Co-Creation' | 'Improvisational';

export type VibeEducationBaseline = 'None' | 'Bachelor' | 'Master' | 'Doctor';

export type VibeSecurityLevel = 'Standard' | 'Medium' | 'High';

export interface VibeChip {
  id: string;
  label: string;
  lexiconKey?: string;
}

export interface VibeHardGates {
  budget_range?: string | null;
  education_baseline?: VibeEducationBaseline;
  industry_preference?: string[];
  security_level?: VibeSecurityLevel;
}

export interface VibeSlotDefinition {
  slot_id: number;
  expected_tag: string;
  reason: string;
  targetMbtiTypes?: string[];
}

export interface VibeBehavioralContract {
  chipId: string;
  title: string;
  clauses: string[];
}

/** 从招募愿景小作文拆分的表单草稿 */
export interface VibeDerivedRecruitmentFields {
  itinerary_summary: string;
  captain_message: string;
}

export interface VibeLlmParsePayload {
  vibe_chips: VibeChip[];
  teamwork_contract_model: VibeTeamworkContractModel;
  hard_gates: VibeHardGates;
  slot_definitions: VibeSlotDefinition[];
  behavioral_contracts: VibeBehavioralContract[];
  contract_hint: string | null;
  parse_source: 'llm' | 'rules';
  parse_version: 'vibe_llm_v1' | 'vibe_llm_v2';
  /** 用户原始招募愿景小作文（发布时写入，供详情页 hero 展示） */
  source_text?: string;
  /** 行程概述 / 队长寄语 — 供发布表单自动填充 */
  derived_fields?: VibeDerivedRecruitmentFields;
  /** Decision OS 命中剧本 id（Gold Dataset / Premium Trekking 等） */
  recruitment_script_id?: string | null;
  /** 场景大类 — 如 premium_trekking 对应左侧 🏃 徒步入口 */
  recruitment_scene_category?: string | null;
}

/** 从招募愿景推断的发布表单建议（前端自动填充 + 服务端缺省回填） */
export interface VibeRecruitmentFormSuggestions {
  destination: string | null;
  /** 目的地大区下拉 id，如 domestic_northwest */
  destinationRegionId: string | null;
  /** 展示文案，如「国内 · 西北」 */
  destinationRegionLabel: string | null;
  /** 细分范围下拉 id，如 qinggan_great_loop */
  destinationSubScopeId: string | null;
  /** 展示文案，如「青甘大环」 */
  destinationSubScopeLabel: string | null;
  departureLabel: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  travelMode: TravelMode | null;
  tripMoodTag: TripMoodTag | null;
  preferenceNotes: string | null;
  /** 命中招募剧本 id — 前端可联动左侧场景菜单（如 hiking） */
  recruitmentScriptId: string | null;
  /** 场景大类 — premium_trekking 等 */
  recruitmentSceneCategory: string | null;
}

export interface VibeLlmParseView {
  payload: VibeLlmParsePayload;
  suggestedPlanningStyle: 'full_managed' | 'co_planning' | 'casual_play';
  suggestedPlanningStyleLabel: string;
  /** 组队风格中文展示（全托管 / 一起策划 / 一起随便玩） */
  teamworkContractModelLabel: string;
  /** 自动填充 itinerarySummary（≤500 字） */
  suggestedItinerarySummary: string;
  /** 自动填充 captainMessage（≤500 字） */
  suggestedCaptainMessage: string;
  /** 目的地 / 预算 / 出行方式等表单字段建议 */
  suggestedFields: VibeRecruitmentFormSuggestions;
  realtime_ready: boolean;
  /** PRD 3.10 — Premium Trekking 命中时，TripNARA World Model / DNA 编排计划 */
  trekkingOrchestration: TrekkingVibeOrchestrationPlan | null;
  /** PRD 3.11 — 意图 → 路线模板检索（搭子广场 ↔ 路线模板双向喂养） */
  routeTemplateMatch: RouteTemplateIntentMatchPlan | null;
}

/** 存储于 captainPersonaSnapshot._vibeLlm */
export const VIBE_LLM_SNAPSHOT_KEY = '_vibeLlm';

/** 存储于 captainPersonaSnapshot._vibeParse — 发布页客户端 parse 快照（GET 原样回显） */
export const VIBE_PARSE_SNAPSHOT_KEY = '_vibeParse';

export interface VibeChipView {
  id: string;
  label: string;
}

export interface VibeBehavioralContractView {
  title: string;
  clauses: string[];
}

/** 招募帖卡片/详情 — PRD Vibe LLM 前端区块 */
export interface VibeLlmPostView {
  /** 用户原始招募愿景（发布页小作文），详情页 hero 副标题/引言 */
  visionText: string | null;
  chips: VibeChipView[];
  contractHint: string | null;
  /** canonical — 算法/存储用 */
  teamworkContractModel: VibeTeamworkContractModel;
  /** UI 展示 — 中文胶囊，如「一起策划」 */
  teamworkContractModelLabel: string;
  hardGatesSummary: string[];
  behavioralContracts: VibeBehavioralContractView[];
  parseSource: 'llm' | 'rules';
  /** 命中剧本 — 详情/卡片可展示场景标签 */
  recruitmentScriptId?: string | null;
  recruitmentSceneCategory?: string | null;
}
