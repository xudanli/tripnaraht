/** Odyssey Intake v2 — 高端圈层：MBTI 自选 + 行中博弈测试 */

export type MbtiLetter = 'E' | 'I' | 'N' | 'S' | 'T' | 'F' | 'J' | 'P';
export type MbtiQuadrant = 'NT' | 'NF' | 'SP' | 'SJ';

/** @deprecated v1 小白场景题 — 仅兼容历史画像 */
export type LegacyScenarioId =
  | 'budget_financial_tolerance'
  | 'ambiguity_tolerance'
  | 'energy_pace'
  | 'social_recharge'
  | 'aesthetic_meaning';

export type ScenarioId = LegacyScenarioId;

/** Premium Stress Test — 行中博弈题（A/B 二选一） */
export type PremiumStressScenarioId =
  | 'resource_scarcity_replan'
  | 'convoy_division_collaboration'
  | 'premium_upcharge_decision';

export type OptionId = 'A' | 'B' | 'C';
export type PremiumOptionId = 'A' | 'B';

/** 行中协作基因（由 Premium 博弈题推断，供车队拼图 / 组队风格匹配） */
export type TravelCollaborationGene =
  | 'full_managed_leader'
  | 'co_planning_partner'
  | 'passive_experiencer'
  | 'team_compromiser';

/** 后台计分维度（PRD 埋点字段） */
export interface OdysseyRawScores {
  financial_flexibility: number;
  planning_index: number;
  compromise_index: number;
  ambiguity_tolerance: number;
  stress_anxiety_index: number;
  energy_capacity: number;
  travel_pace: number;
  social_drive: number;
  aesthetic_preference: number;
  mbti_e_score: number;
  mbti_i_score: number;
  mbti_n_score: number;
  mbti_s_score: number;
  mbti_j_score: number;
  mbti_p_score: number;
  mbti_f_score: number;
  mbti_t_score: number;
  /** Premium Stress Test 维度 */
  quality_baseline: number;
  risk_appetite: number;
  safety_first: number;
  control_desire: number;
  collaborative_trait: number;
  financial_elasticity: number;
  independence: number;
}

export interface OdysseyDimensionPercents {
  E: number;
  I: number;
  N: number;
  S: number;
  T: number;
  F: number;
  J: number;
  P: number;
}

export interface OdysseyCardTheme {
  quadrant: MbtiQuadrant;
  gradientFrom: string;
  gradientTo: string;
  accentColor?: string;
}

export interface OdysseyIdentityCard {
  mbtiType: string;
  title: string;
  subtitle: string;
  theme: OdysseyCardTheme;
  radar: Record<string, number>;
}

export interface OdysseyIntakeProfile {
  /** 1 = 旧 5 题测评；2 = MBTI 自选 + Premium Stress Test */
  version: 1 | 2;
  completedAt: string;
  /** @deprecated v1 场景题答案 */
  answers?: Partial<Record<ScenarioId, OptionId>>;
  /** v2 Premium 博弈题答案 */
  premiumStressAnswers?: Partial<Record<PremiumStressScenarioId, PremiumOptionId>>;
  rawScores: OdysseyRawScores;
  mbtiType: string;
  /** v2：用户自选 MBTI，非答题推断 */
  mbtiSource?: 'self_selected' | 'inferred';
  dimensionPercents: OdysseyDimensionPercents;
  card: OdysseyIdentityCard;
  /** v2：行中协作基因 */
  travelCollaborationGene?: TravelCollaborationGene;
  travelCollaborationGeneLabel?: string;
  /** v2：MBTI 自选时间（未完成 Premium 前为 partial draft） */
  mbtiSelectedAt?: string;
  /** 当前出行即时意向标签（不改变底层人格） */
  tripIntentTags?: string[];
  /** 行后互评触发卡片流光刷新 */
  profileRefreshPending?: boolean;
  profileRefreshMessage?: string;
}

export interface OdysseyQuestionOption {
  id: OptionId;
  label: string;
}

export interface OdysseyScenarioQuestion {
  id: ScenarioId;
  order: number;
  title: string;
  scenario: string;
  wallpaperKey: string;
  options: OdysseyQuestionOption[];
}

export interface PremiumStressQuestion {
  id: PremiumStressScenarioId;
  order: number;
  title: string;
  scenario: string;
  wallpaperKey: string;
  options: Array<{ id: PremiumOptionId; label: string }>;
}

export interface ScoreDelta {
  [key: string]: number;
}
