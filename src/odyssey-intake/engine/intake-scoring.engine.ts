import { ODYSSEY_OPTION_SCORE_DELTAS } from '../config/scenario-question-bank.config';
import { PREMIUM_STRESS_SCORE_DELTAS } from '../config/premium-stress-test.config';
import {
  ODYSSEY_CARD_MAPPING_RULES,
  ODYSSEY_CARD_THEMES,
  ODYSSEY_QUADRANT_FALLBACK,
  type CardMappingContext,
} from '../config/card-mapping.config';
import type {
  MbtiQuadrant,
  OdysseyDimensionPercents,
  OdysseyIdentityCard,
  OdysseyRawScores,
  OptionId,
  PremiumOptionId,
  PremiumStressScenarioId,
  ScenarioId,
  TravelCollaborationGene,
} from '../types/odyssey-intake.types';

export function createEmptyRawScores(): OdysseyRawScores {
  return {
    financial_flexibility: 0,
    planning_index: 0,
    compromise_index: 0,
    ambiguity_tolerance: 0,
    stress_anxiety_index: 0,
    energy_capacity: 0,
    travel_pace: 0,
    social_drive: 0,
    aesthetic_preference: 0,
    mbti_e_score: 0,
    mbti_i_score: 0,
    mbti_n_score: 0,
    mbti_s_score: 0,
    mbti_j_score: 0,
    mbti_p_score: 0,
    mbti_f_score: 0,
    mbti_t_score: 0,
    quality_baseline: 0,
    risk_appetite: 0,
    safety_first: 0,
    control_desire: 0,
    collaborative_trait: 0,
    financial_elasticity: 0,
    independence: 0,
  };
}

/** 聚合 v1 五道题选项 → 原始分值 */
export function aggregateScoresFromAnswers(
  answers: Partial<Record<ScenarioId, OptionId>>,
): OdysseyRawScores {
  const scores = createEmptyRawScores();

  for (const [scenarioId, optionId] of Object.entries(answers) as Array<[ScenarioId, OptionId]>) {
    const deltas = ODYSSEY_OPTION_SCORE_DELTAS[scenarioId]?.[optionId];
    if (!deltas) continue;
    for (const [key, delta] of Object.entries(deltas)) {
      const k = key as keyof OdysseyRawScores;
      scores[k] = (scores[k] ?? 0) + delta;
    }
  }

  return scores;
}

/** 聚合 Premium Stress Test 博弈题 → 行中决策维度 */
export function aggregatePremiumStressScores(
  answers: Partial<Record<PremiumStressScenarioId, PremiumOptionId>>,
): OdysseyRawScores {
  const scores = createEmptyRawScores();

  for (const [scenarioId, optionId] of Object.entries(answers) as Array<
    [PremiumStressScenarioId, PremiumOptionId]
  >) {
    const deltas = PREMIUM_STRESS_SCORE_DELTAS[scenarioId]?.[optionId];
    if (!deltas) continue;
    for (const [key, delta] of Object.entries(deltas)) {
      const k = key as keyof OdysseyRawScores;
      scores[k] = (scores[k] ?? 0) + delta;
    }
  }

  return scores;
}

/** v2：从用户自选的 MBTI 四字母直接映射维度百分比（不测 E/I） */
export function dimensionPercentsFromMbtiType(mbtiType: string): OdysseyDimensionPercents {
  const t = mbtiType.toUpperCase();
  const pick = (letter: string, pos: string, neg: string) =>
    letter === pos ? { pos: 72, neg: 28 } : { pos: 28, neg: 72 };

  const ei = pick(t[0] ?? 'I', 'E', 'I');
  const ns = pick(t[1] ?? 'S', 'N', 'S');
  const tf = pick(t[2] ?? 'T', 'T', 'F');
  const jp = pick(t[3] ?? 'J', 'J', 'P');

  return {
    E: ei.pos,
    I: ei.neg,
    N: ns.pos,
    S: ns.neg,
    T: tf.pos,
    F: tf.neg,
    J: jp.pos,
    P: jp.neg,
  };
}

function pairPercent(positive: number, negative: number): { pos: number; neg: number } {
  const total = positive + negative;
  if (total <= 0) return { pos: 50, neg: 50 };
  return {
    pos: Math.round((positive / total) * 100),
    neg: Math.round((negative / total) * 100),
  };
}

/** MBTI 四象限百分比（v1 答题推断） */
export function computeDimensionPercents(scores: OdysseyRawScores): OdysseyDimensionPercents {
  const ei = pairPercent(scores.mbti_e_score, scores.mbti_i_score);
  const ns = pairPercent(scores.mbti_n_score, scores.mbti_s_score);
  const tf = pairPercent(scores.mbti_t_score + scores.mbti_j_score, scores.mbti_f_score);
  const jp = pairPercent(scores.mbti_j_score, scores.mbti_p_score);

  return {
    E: ei.pos,
    I: ei.neg,
    N: ns.pos,
    S: ns.neg,
    T: tf.pos,
    F: tf.neg,
    J: jp.pos,
    P: jp.neg,
  };
}

export function resolveMbtiType(percents: OdysseyDimensionPercents): string {
  return [
    percents.E >= percents.I ? 'E' : 'I',
    percents.N >= percents.S ? 'N' : 'S',
    percents.T >= percents.F ? 'T' : 'F',
    percents.J >= percents.P ? 'J' : 'P',
  ].join('');
}

export function resolveQuadrant(mbtiType: string): MbtiQuadrant {
  const letters = mbtiType.slice(0, 2);
  if (letters.includes('N') && letters.includes('T')) return 'NT';
  if (letters.includes('N') && letters.includes('F')) return 'NF';
  if (letters.includes('S') && letters.includes('P')) return 'SP';
  return 'SJ';
}

const TRAVEL_COLLABORATION_GENE_LABELS: Record<TravelCollaborationGene, string> = {
  full_managed_leader: '全托管 · 队长型',
  co_planning_partner: '一起策划 · 协同型',
  passive_experiencer: '随性体验 · 执行跟随型',
  team_compromiser: '团队优先 · 妥协型',
};

/** 从 Premium 博弈题分值推断行中协作基因 */
export function inferTravelCollaborationGene(scores: OdysseyRawScores): TravelCollaborationGene {
  if (scores.control_desire >= 2) return 'full_managed_leader';
  if (scores.collaborative_trait >= 2) return 'co_planning_partner';
  if (scores.compromise_index >= 2) return 'team_compromiser';
  if (scores.independence >= 2 && scores.financial_elasticity >= 2) return 'passive_experiencer';
  if (scores.safety_first >= 2) return 'team_compromiser';
  if (scores.quality_baseline >= 2) return 'full_managed_leader';
  return 'co_planning_partner';
}

export function resolveTravelCollaborationGeneLabel(gene: TravelCollaborationGene): string {
  return TRAVEL_COLLABORATION_GENE_LABELS[gene];
}

function isPremiumProfile(scores: OdysseyRawScores): boolean {
  return (
    scores.control_desire !== 0 ||
    scores.collaborative_trait !== 0 ||
    scores.quality_baseline !== 0 ||
    scores.financial_elasticity !== 0
  );
}

/** 将原始分值归一化到 0–100 供雷达图渲染 */
export function buildRadarValues(scores: OdysseyRawScores): Record<string, number> {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round((v + 4) * 12.5)));

  if (isPremiumProfile(scores)) {
    return {
      品质底线: clamp(scores.quality_baseline),
      风险偏好: clamp(scores.risk_appetite),
      安全优先: clamp(scores.safety_first),
      行中主导度: clamp(scores.control_desire),
      协同偏好: clamp(scores.collaborative_trait),
      消费弹性: clamp(scores.financial_elasticity),
      独立决策: clamp(scores.independence),
      团队妥协: clamp(scores.compromise_index),
    };
  }

  return {
    消费弹性: clamp(scores.financial_flexibility),
    计划硬度: clamp(scores.planning_index + scores.mbti_j_score * 0.5),
    不确定性容忍: clamp(scores.ambiguity_tolerance),
    精力上限: clamp(scores.energy_capacity),
    社交驱动: clamp(scores.social_drive),
    意义感导向: clamp(scores.aesthetic_preference),
    妥协度: clamp(scores.compromise_index),
    沟通顺畅度: clamp(scores.compromise_index + scores.mbti_f_score),
  };
}

export function resolveIdentityCard(
  scores: OdysseyRawScores,
  percents?: OdysseyDimensionPercents,
  mbtiType?: string,
): OdysseyIdentityCard {
  const resolvedPercents = percents ?? computeDimensionPercents(scores);
  const resolvedType = mbtiType ?? resolveMbtiType(resolvedPercents);
  const quadrant = resolveQuadrant(resolvedType);
  const themeBase = ODYSSEY_CARD_THEMES[quadrant];

  const ctx: CardMappingContext = {
    mbtiType: resolvedType,
    quadrant,
    percents: resolvedPercents,
    scores,
  };

  const matched = ODYSSEY_CARD_MAPPING_RULES.find((rule) => rule.when(ctx)) ?? null;
  const fallback = ODYSSEY_QUADRANT_FALLBACK[quadrant];

  return {
    mbtiType: resolvedType,
    title: matched?.title ?? fallback.title,
    subtitle: matched?.subtitle ?? fallback.subtitle,
    theme: {
      quadrant,
      gradientFrom: themeBase.gradientFrom,
      gradientTo: themeBase.gradientTo,
      accentColor: themeBase.accentColor,
    },
    radar: buildRadarValues(scores),
  };
}

/** v1：从答题记录生成完整画像 */
export function buildProfileFromAnswers(
  answers: Partial<Record<ScenarioId, OptionId>>,
): {
  rawScores: OdysseyRawScores;
  dimensionPercents: OdysseyDimensionPercents;
  mbtiType: string;
  card: OdysseyIdentityCard;
} {
  const rawScores = aggregateScoresFromAnswers(answers);
  const dimensionPercents = computeDimensionPercents(rawScores);
  const mbtiType = resolveMbtiType(dimensionPercents);
  const card = resolveIdentityCard(rawScores, dimensionPercents, mbtiType);

  return { rawScores, dimensionPercents, mbtiType, card };
}

/** v2：MBTI 自选 + Premium Stress Test */
export function buildProfileFromPremiumIntake(
  mbtiType: string,
  premiumAnswers: Partial<Record<PremiumStressScenarioId, PremiumOptionId>>,
): {
  rawScores: OdysseyRawScores;
  dimensionPercents: OdysseyDimensionPercents;
  mbtiType: string;
  card: OdysseyIdentityCard;
  travelCollaborationGene: TravelCollaborationGene;
  travelCollaborationGeneLabel: string;
} {
  const normalizedMbti = mbtiType.toUpperCase();
  const rawScores = aggregatePremiumStressScores(premiumAnswers);
  const dimensionPercents = dimensionPercentsFromMbtiType(normalizedMbti);
  const card = resolveIdentityCard(rawScores, dimensionPercents, normalizedMbti);
  const travelCollaborationGene = inferTravelCollaborationGene(rawScores);

  return {
    rawScores,
    dimensionPercents,
    mbtiType: normalizedMbti,
    card,
    travelCollaborationGene,
    travelCollaborationGeneLabel: resolveTravelCollaborationGeneLabel(travelCollaborationGene),
  };
}
