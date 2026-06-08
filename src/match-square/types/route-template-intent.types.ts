/** PRD 3.11 — Vibe 意图 → 路线模板检索与双向喂养 */

export const ROUTE_TEMPLATE_INTENT_VERSION = 'route_template_intent_v1' as const;

export type RouteTemplateMatchConfidence = 'highlight' | 'suggest' | 'low';

export interface RouteTemplateIntentCatalogEntry {
  catalogId: string;
  routeDirectionName: string;
  durationDays: number;
  titleZh: string;
  subtitleZh?: string;
  /** 意图检索关键词（配置驱动，非 engine if/else） */
  matchKeywords: readonly string[];
  recruitmentScriptIds?: readonly string[];
  destinationSubScopeIds?: readonly string[];
  /** 模板物理约束 — 驱动拼图槽位 augmentation */
  physicalConstraints?: readonly string[];
  slotAugmentations?: readonly RouteTemplateSlotAugmentation[];
  /** Trip Vault 里程碑 id（契约固化，Phase 3） */
  vaultMilestoneIds?: readonly string[];
  /** ≥ 此分数为高光 Chip（默认 0.85） */
  autoSuggestThreshold: number;
}

export interface RouteTemplateSlotAugmentation {
  slotRole: 'gear_rescue' | 'weather_nav' | 'dye_listener' | 'pace_pacer';
  expectedTagSuffix: string;
  reason: string;
}

export interface RouteTemplateIntentMatch {
  catalogId: string;
  routeDirectionName: string;
  durationDays: number;
  titleZh: string;
  subtitleZh: string | null;
  matchScore: number;
  matchPercent: number;
  confidence: RouteTemplateMatchConfidence;
  physicalConstraints: string[];
  slotAugmentations: RouteTemplateSlotAugmentation[];
  vaultMilestoneIds: string[];
  /** 前端 CTA：以此模板发起招募 */
  launchRecruitmentAction: 'confirm_template' | 'preview_only';
}

export interface RouteTemplateIntentMatchPlan {
  version: typeof ROUTE_TEMPLATE_INTENT_VERSION;
  primaryMatch: RouteTemplateIntentMatch | null;
  suggestions: RouteTemplateIntentMatch[];
  /** 链路 B：AI 关联提示文案 */
  associationHint: string | null;
}
