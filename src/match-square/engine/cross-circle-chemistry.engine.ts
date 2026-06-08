import type { ProfessionIndustryTag } from '../../odyssey-intake/types/verified-credentials.types';
import type { OdysseyDimensionPercents, OdysseyRawScores } from '../../odyssey-intake/types/odyssey-intake.types';
import type { UserFeatureVector } from './user-feature-vector.engine';

/** 泛互联网 / 白领大脑集群（易同质化） */
export const INTERNET_WHITE_COLLAR_INDUSTRIES: ReadonlySet<ProfessionIndustryTag> = new Set([
  'tech',
  'consulting',
  'finance',
]);

/** 破圈高能量注入行业 */
export const CROSS_CIRCLE_INDUSTRIES: ReadonlySet<ProfessionIndustryTag> = new Set([
  'creative',
  'manufacturing',
  'other',
]);

export type CrossCircleChemistryScriptId =
  | 'wall_break_flywheel'
  | 'intellect_wild_fusion'
  | 'narrative_sensory_awakening';

export interface CrossCircleChemistryScript {
  id: CrossCircleChemistryScriptId;
  title: string;
  captainMbtiTypes: string[];
  memberMbtiTypes: string[];
  captainIndustries: ProfessionIndustryTag[];
  memberIndustries: ProfessionIndustryTag[];
  bonusPoints: number;
  narrative: string;
  userMindset: string;
  puzzleLabel: string;
  puzzleRationale: string;
}

/** 三个破圈级化学反应配对剧本 */
export const CROSS_CIRCLE_CHEMISTRY_SCRIPTS: CrossCircleChemistryScript[] = [
  {
    id: 'wall_break_flywheel',
    title: '破壁飞轮',
    captainMbtiTypes: ['INTJ', 'ENTJ'],
    memberMbtiTypes: ['ENFP', 'ESFP'],
    captainIndustries: ['tech', 'consulting', 'finance'],
    memberIndustries: ['creative', 'other', 'manufacturing'],
    bonusPoints: 18,
    narrative:
      '高管指挥官 × 旷野高能艺术家：总监打理后勤与安全，艺术家注入即兴狂欢与治愈感。',
    userMindset: '大厂人久违的「被治愈感」× 艺术家顶配省心出行保障',
    puzzleLabel: '🎭 破壁飞轮 · 旷野高能艺术家',
    puzzleRationale:
      '队长偏理性全托管，建议补位策展/设计/自由创作型高能量队友，击碎「换个地方开周会」的同质化风险',
  },
  {
    id: 'intellect_wild_fusion',
    title: '智力与物理的野性融合',
    captainMbtiTypes: ['INTP', 'ISTJ'],
    memberMbtiTypes: ['ISTP', 'ESTP'],
    captainIndustries: ['tech', 'consulting'],
    memberIndustries: ['manufacturing', 'other', 'creative'],
    bonusPoints: 18,
    narrative:
      '数字架构师 × 物理硬核玩家：一个在算模型，一个已提着绞盘下车 — 工匠精神跨维度共鸣。',
    userMindset: '精神内耗的互联网人 × 扑面而来的野性执行力崇拜',
    puzzleLabel: '🛞 野性融合 · 物理执行硬核玩家',
    puzzleRationale:
      '队长偏数字世界高智商低表达，建议补位制造/户外硬核、具备现场动手能力的高能量队友',
  },
  {
    id: 'narrative_sensory_awakening',
    title: '宏大叙事与感官觉醒',
    captainMbtiTypes: ['INFJ', 'ENFJ'],
    memberMbtiTypes: ['ESFJ', 'ISFP'],
    captainIndustries: ['tech', 'consulting', 'finance'],
    memberIndustries: ['manufacturing', 'creative', 'other'],
    bonusPoints: 18,
    narrative:
      '战略分析师 × 烟火气主理人：从 PPT 宏大叙事，被拽回菜市场香料与碳水炸弹的真实地球。',
    userMindset: '悬浮高管的「Earth 解毒剂」× 具体生活的掌控感',
    puzzleLabel: '🧭 感官觉醒 · 烟火气生活主理人',
    puzzleRationale:
      '队长易陷入宏观叙事悬浮，建议补位消费/实业/供应链型、对具体感官极度敏锐的高能量队友',
  },
];

export interface CrossCircleChemistryMatch {
  script: CrossCircleChemistryScript;
  bonusPoints: number;
}

export interface IndustryAntiClusterResult {
  deltaPoints: number;
  sameIndustryPenalty: boolean;
  crossIndustryBoost: boolean;
  narrative: string | null;
}

export const SAME_INDUSTRY_HOMOGENEITY_PENALTY = -10;
export const CROSS_INDUSTRY_HIGH_ENERGY_BONUS = 20;

export function resolveProfessionIndustry(
  credentials?: { profession?: { industryTag?: ProfessionIndustryTag } } | null,
  social?: { professionIndustry?: ProfessionIndustryTag } | null,
): ProfessionIndustryTag | undefined {
  return credentials?.profession?.industryTag ?? social?.professionIndustry;
}

export function isInternetWhiteCollar(industry?: ProfessionIndustryTag): boolean {
  return industry != null && INTERNET_WHITE_COLLAR_INDUSTRIES.has(industry);
}

export function isCrossCircleIndustry(industry?: ProfessionIndustryTag): boolean {
  return industry != null && CROSS_CIRCLE_INDUSTRIES.has(industry);
}

/** 博弈题 + MBTI：高能量 / 高弹性（P 倾向） */
export function isHighEnergyElasticMember(
  memberVector: UserFeatureVector,
  dimensionPercents: OdysseyDimensionPercents,
  rawScores: OdysseyRawScores,
): boolean {
  return (
    dimensionPercents.P >= 55 ||
    dimensionPercents.E >= 55 ||
    rawScores.ambiguity_tolerance >= 1 ||
    rawScores.risk_appetite >= 1 ||
    memberVector.cControl <= 3
  );
}

/** 检测是否命中破圈化学反应剧本 */
export function detectCrossCircleChemistry(input: {
  captainMbti: string;
  memberMbti: string;
  captainIndustry?: ProfessionIndustryTag;
  memberIndustry?: ProfessionIndustryTag;
  memberHighEnergy: boolean;
}): CrossCircleChemistryMatch | null {
  for (const script of CROSS_CIRCLE_CHEMISTRY_SCRIPTS) {
    if (!script.captainMbtiTypes.includes(input.captainMbti)) continue;
    if (!script.memberMbtiTypes.includes(input.memberMbti)) continue;
    if (input.captainIndustry && !script.captainIndustries.includes(input.captainIndustry)) {
      continue;
    }
    if (input.memberIndustry && !script.memberIndustries.includes(input.memberIndustry)) {
      continue;
    }
    if (!input.memberHighEnergy && script.id === 'wall_break_flywheel') {
      continue;
    }
    return { script, bonusPoints: script.bonusPoints };
  }
  return null;
}

/**
 * Industry Anti-Clustering — 保持 Hard Gate 圈层安全，打破行业同质化
 * 同互联网集群：-10；跨圈 + 高能量：+20（剧本命中时不重复 +20）
 */
export function computeIndustryAntiClustering(input: {
  captainIndustry?: ProfessionIndustryTag;
  memberIndustry?: ProfessionIndustryTag;
  memberHighEnergy: boolean;
  chemistryMatched: boolean;
}): IndustryAntiClusterResult {
  if (!isInternetWhiteCollar(input.captainIndustry)) {
    return { deltaPoints: 0, sameIndustryPenalty: false, crossIndustryBoost: false, narrative: null };
  }

  const captain = input.captainIndustry!;
  const member = input.memberIndustry;

  if (member && member === captain) {
    return {
      deltaPoints: SAME_INDUSTRY_HOMOGENEITY_PENALTY,
      sameIndustryPenalty: true,
      crossIndustryBoost: false,
      narrative: '行业 Anti-Clustering：同为互联网/咨询/金融背景，降低同质化「开周会式旅行」权重。',
    };
  }

  if (
    !input.chemistryMatched &&
    member &&
    isCrossCircleIndustry(member) &&
    input.memberHighEnergy
  ) {
    return {
      deltaPoints: CROSS_INDUSTRY_HIGH_ENERGY_BONUS,
      sameIndustryPenalty: false,
      crossIndustryBoost: true,
      narrative:
        '行业 Anti-Clustering：背书同档跨界（文化/艺术/实业/消费）+ 高能量高弹性，结构性认知对撞加权。',
    };
  }

  if (member && isInternetWhiteCollar(member) && member !== captain) {
    return {
      deltaPoints: -5,
      sameIndustryPenalty: false,
      crossIndustryBoost: false,
      narrative: '仍为白领集群内部匹配，破圈化学反应权重有限。',
    };
  }

  return { deltaPoints: 0, sameIndustryPenalty: false, crossIndustryBoost: false, narrative: null };
}

/** 为车队拼图解析队长最优先的破圈缺位 */
export function resolveCrossCirclePuzzleSlot(input: {
  captainMbti: string;
  captainIndustry?: ProfessionIndustryTag;
}): CrossCircleChemistryScript | null {
  if (!isInternetWhiteCollar(input.captainIndustry)) return null;

  return (
    CROSS_CIRCLE_CHEMISTRY_SCRIPTS.find((script) => {
      if (!script.captainMbtiTypes.includes(input.captainMbti)) return false;
      if (input.captainIndustry && !script.captainIndustries.includes(input.captainIndustry)) {
        return false;
      }
      return true;
    }) ?? null
  );
}
