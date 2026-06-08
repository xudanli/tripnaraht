import { computeMbtiSynergyBonus } from '../config/mbti-synergy-matrix.config';
import {
  computeIndustryAntiClustering,
  detectCrossCircleChemistry,
  isHighEnergyElasticMember,
  resolveProfessionIndustry,
  type CrossCircleChemistryScriptId,
} from './cross-circle-chemistry.engine';
import type { RecruitmentPlanningStyle } from '../types/match-square.types';
import {
  buildUserFeatureVector,
  socialScoreToTier,
  type UserFeatureVector,
} from './user-feature-vector.engine';
import type { SocialBackgroundProfile } from './social-background-matching.engine';
import type { VerifiedCredentialsBundle } from '../../odyssey-intake/types/verified-credentials.types';
import type { OdysseyRawScores, OdysseyDimensionPercents } from '../../odyssey-intake/types/odyssey-intake.types';

export const STRUCTURAL_MATCH_ALGORITHM = 'graph_cluster_csp_v2' as const;
export const MIN_TRIP_OVERLAP_DAYS = 3;
export const MAX_SOCIAL_TIER_GAP = 3;

export interface TripWindow {
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface StructuralMatchParticipant {
  userId?: string;
  mbtiType: string;
  rawScores: OdysseyRawScores;
  dimensionPercents: OdysseyDimensionPercents;
  credentials?: VerifiedCredentialsBundle | null;
  social?: SocialBackgroundProfile | null;
  trip?: TripWindow | null;
}

export type StructuralHardGateReason =
  | 'time_location_mismatch'
  | 'social_bandwidth_gap'
  | 'destination_mismatch';

export interface StructuralMatchBreakdown {
  baseScore: number;
  teamworkFitPoints: number;
  stressFitPoints: number;
  mbtiSynergyPoints: number;
  chemistryScriptPoints: number;
  industryAntiClusterPoints: number;
  chemistryScriptId?: CrossCircleChemistryScriptId;
  chemistryScriptTitle?: string;
  algorithm: typeof STRUCTURAL_MATCH_ALGORITHM;
  leaderVector: Pick<UserFeatureVector, 'cControl' | 'aQualityAmbiguity' | 'fFinancialIndependence' | 'socialScore'>;
  memberVector: Pick<UserFeatureVector, 'cControl' | 'aQualityAmbiguity' | 'fFinancialIndependence' | 'socialScore'>;
}

export interface MatchInsightDrawerLine {
  status: 'ok' | 'warn' | 'neutral';
  label: string;
  detail: string;
}

export interface MatchInsightDrawerView {
  headline: string;
  lines: MatchInsightDrawerLine[];
}

export interface StructuralMatchResult {
  hardBlocked: boolean;
  hardGateReason: StructuralHardGateReason | null;
  hardGateMessage: string | null;
  compatibilityPercent: number | null;
  breakdown: StructuralMatchBreakdown | null;
  insightDrawer: MatchInsightDrawerView | null;
  highlights: string[];
  warnings: string[];
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** 时空交集天数（含首尾） */
export function computeTripOverlapDays(a: TripWindow, b: TripWindow): number {
  if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return 0;
  const start = parseDate(a.startDate > b.startDate ? a.startDate : b.startDate);
  const end = parseDate(a.endDate < b.endDate ? a.endDate : b.endDate);
  if (end < start) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

export function failsDestinationMismatch(leader: TripWindow, member: TripWindow): boolean {
  if (!leader.destination || !member.destination) return false;
  return leader.destination.trim().toLowerCase() !== member.destination.trim().toLowerCase();
}

export function failsTimeLocationHardGate(leader: TripWindow, member: TripWindow): boolean {
  if (failsDestinationMismatch(leader, member)) return true;
  if (!leader.startDate || !leader.endDate || !member.startDate || !member.endDate) {
    return false;
  }
  return computeTripOverlapDays(leader, member) < MIN_TRIP_OVERLAP_DAYS;
}

export function failsSocialBandwidthGate(
  leader: UserFeatureVector,
  member: UserFeatureVector,
): boolean {
  const tierGap = Math.abs(socialScoreToTier(leader.socialScore) - socialScoreToTier(member.socialScore));
  if (tierGap >= MAX_SOCIAL_TIER_GAP) return true;

  const delta = Math.abs(leader.socialScore - member.socialScore);
  const maxScore = Math.max(leader.socialScore, member.socialScore, 1);
  if (maxScore >= 30 && delta / maxScore > 0.85) return true;

  return false;
}

function euclidean2(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** 场景2映射 + 契约模式互补矩阵 */
export function computeTeamworkFitPoints(
  leader: UserFeatureVector,
  member: UserFeatureVector,
  teamworkStyle?: RecruitmentPlanningStyle | null,
): number {
  const lc = leader.cControl;
  const mc = member.cControl;

  if (teamworkStyle === 'full_managed' || lc >= 9) {
    if (lc >= 9 && mc <= 2) return 25;
    if (lc >= 9 && mc >= 9) return -20;
  }

  if (teamworkStyle === 'co_planning' || (lc >= 4 && lc <= 6 && mc >= 4 && mc <= 6)) {
    if (lc >= 4 && lc <= 6 && mc >= 4 && mc <= 6) return 20;
  }

  if (teamworkStyle === 'casual_play' && mc <= 3 && lc <= 3) return 15;

  if (lc >= 9 && mc <= 2) return 25;
  if (lc >= 9 && mc >= 9) return -20;
  if (Math.abs(lc - mc) <= 1 && lc >= 4) return 20;

  return 5;
}

/** 场景1+3：品质底线 A 与财务弹性 F 欧氏距离 → 扣分 */
export function computeStressFitPoints(leader: UserFeatureVector, member: UserFeatureVector): number {
  const distance = euclidean2(
    [leader.aQualityAmbiguity, leader.fFinancialIndependence],
    [member.aQualityAmbiguity, member.fFinancialIndependence],
  );
  return Math.max(-15, Math.round(-1.5 * distance));
}

export function buildMatchInsightDrawer(
  leader: UserFeatureVector,
  member: UserFeatureVector,
  breakdown: StructuralMatchBreakdown,
  teamworkStyle?: RecruitmentPlanningStyle | null,
): MatchInsightDrawerView {
  const lines: MatchInsightDrawerLine[] = [];

  const tierGap = Math.abs(socialScoreToTier(leader.socialScore) - socialScoreToTier(member.socialScore));
  lines.push({
    status: tierGap <= 1 ? 'ok' : tierGap === 2 ? 'neutral' : 'warn',
    label: '圈层沟通带宽',
    detail:
      tierGap <= 1
        ? '完美同频（学历/职级/信用仍处同一教养带宽）'
        : tierGap === 2
          ? '基本同频（存在可协商的阶层差）'
          : '错位风险（背书层级跨度较大，系统已降权或过滤）',
  });

  if (breakdown.chemistryScriptTitle) {
    lines.push({
      status: 'ok',
      label: `破圈化学反应 · ${breakdown.chemistryScriptTitle}`,
      detail: '结构性认知对撞剧本命中 — 同质大厂局风险被主动打破',
    });
  } else if (breakdown.industryAntiClusterPoints >= 15) {
    lines.push({
      status: 'ok',
      label: '行业 Anti-Clustering',
      detail: '跨界高能量队友加权 — 避免「两个总监上车复盘 ROI」',
    });
  } else if (breakdown.industryAntiClusterPoints <= -5) {
    lines.push({
      status: 'warn',
      label: '行业同质化风险',
      detail: '同为互联网/咨询/金融背景，行中易陷入「换地点开周会」',
    });
  }

  const tf = breakdown.teamworkFitPoints;
  let contractDetail = '契约分工可协商';
  if (tf >= 20) {
    contractDetail =
      teamworkStyle === 'co_planning'
        ? '民主合伙人飞轮（一起策划 × 协同型）'
        : '高效飞轮（全托管队长 ＋ 执行跟随型队员）';
  } else if (tf <= -10) {
    contractDetail = '权力边界冲突（双方均倾向主导决策）';
  }
  lines.push({
    status: tf >= 15 ? 'ok' : tf <= -10 ? 'warn' : 'neutral',
    label: '团队契约分工',
    detail: contractDetail,
  });

  const stressRisk = Math.abs(leader.aQualityAmbiguity - member.aQualityAmbiguity);
  lines.push({
    status: stressRisk >= 6 ? 'warn' : stressRisk <= 2 ? 'ok' : 'neutral',
    label: '行中审美/品质分歧',
    detail:
      stressRisk >= 6
        ? '中度风险（品质底线与消费弹性差距大，易起摩擦）'
        : stressRisk <= 2
          ? '高度对齐（住宿档次与 Plan B 预期一致）'
          : '轻度分歧（行前对齐预算与住宿预期即可）',
  });

  if (breakdown.mbtiSynergyPoints >= 10) {
    lines.push({
      status: 'ok',
      label: 'MBTI 角色拼图',
      detail: '职场公路片互补位触发（气氛组/执行副手加成）',
    });
  }

  return {
    headline: '团队结构稳定性报告',
    lines,
  };
}

/**
 * Graph Clustering + CSP 双层撮合
 * Layer 1: 时空 + 沟通带宽 Hard Gate
 * Layer 2: 契约互补 + 抗压对齐 + MBTI 协同
 */
export function computeStructuralMatchScore(input: {
  leader: StructuralMatchParticipant;
  member: StructuralMatchParticipant;
  teamworkStyle?: RecruitmentPlanningStyle | null;
  skipTripGate?: boolean;
}): StructuralMatchResult {
  const leaderVector = buildUserFeatureVector({
    mbtiType: input.leader.mbtiType,
    rawScores: input.leader.rawScores,
    dimensionPercents: input.leader.dimensionPercents,
    credentials: input.leader.credentials,
    social: input.leader.social,
  });
  const memberVector = buildUserFeatureVector({
    mbtiType: input.member.mbtiType,
    rawScores: input.member.rawScores,
    dimensionPercents: input.member.dimensionPercents,
    credentials: input.member.credentials,
    social: input.member.social,
  });

  const leaderTrip = input.leader.trip ?? {};
  const memberTrip = input.member.trip ?? {};

  if (!input.skipTripGate && leaderTrip.startDate && memberTrip.startDate) {
    if (failsTimeLocationHardGate(leaderTrip, memberTrip)) {
      const reason: StructuralHardGateReason = failsDestinationMismatch(leaderTrip, memberTrip)
        ? 'destination_mismatch'
        : 'time_location_mismatch';
      return {
        hardBlocked: true,
        hardGateReason: reason,
        hardGateMessage:
          reason === 'destination_mismatch'
            ? '目的地不一致，系统不予推荐。'
            : `行程时间交集不足 ${MIN_TRIP_OVERLAP_DAYS} 天，系统不予推荐。`,
        compatibilityPercent: null,
        breakdown: null,
        insightDrawer: null,
        highlights: [],
        warnings: [],
      };
    }
  }

  if (failsSocialBandwidthGate(leaderVector, memberVector)) {
    return {
      hardBlocked: true,
      hardGateReason: 'social_bandwidth_gap',
      hardGateMessage: '圈层/沟通带宽严重错位，系统隐性不予推荐。',
      compatibilityPercent: null,
      breakdown: null,
      insightDrawer: null,
      highlights: [],
      warnings: ['背书层级跨度超过安全阈值，沟通同频成本过高。'],
    };
  }

  const teamworkFitPoints = computeTeamworkFitPoints(
    leaderVector,
    memberVector,
    input.teamworkStyle,
  );
  const stressFitPoints = computeStressFitPoints(leaderVector, memberVector);
  const synergy = computeMbtiSynergyBonus(leaderVector.mbtiType, memberVector.mbtiType);
  const mbtiSynergyPoints = synergy.bonusPoints;

  const captainIndustry = resolveProfessionIndustry(input.leader.credentials, input.leader.social);
  const memberIndustry = resolveProfessionIndustry(input.member.credentials, input.member.social);
  const memberHighEnergy = isHighEnergyElasticMember(
    memberVector,
    input.member.dimensionPercents,
    input.member.rawScores,
  );

  const chemistry = detectCrossCircleChemistry({
    captainMbti: leaderVector.mbtiType,
    memberMbti: memberVector.mbtiType,
    captainIndustry,
    memberIndustry,
    memberHighEnergy,
  });
  const industryAntiCluster = computeIndustryAntiClustering({
    captainIndustry,
    memberIndustry,
    memberHighEnergy,
    chemistryMatched: chemistry != null,
  });

  const chemistryScriptPoints = chemistry?.bonusPoints ?? 0;
  const industryAntiClusterPoints = industryAntiCluster.deltaPoints;

  const baseScore = 50;
  const rawTotal =
    baseScore +
    teamworkFitPoints +
    stressFitPoints +
    mbtiSynergyPoints +
    chemistryScriptPoints +
    industryAntiClusterPoints;
  const compatibilityPercent = Math.min(100, Math.max(50, Math.round(rawTotal)));

  const breakdown: StructuralMatchBreakdown = {
    baseScore,
    teamworkFitPoints,
    stressFitPoints,
    mbtiSynergyPoints,
    chemistryScriptPoints,
    industryAntiClusterPoints,
    chemistryScriptId: chemistry?.script.id,
    chemistryScriptTitle: chemistry?.script.title,
    algorithm: STRUCTURAL_MATCH_ALGORITHM,
    leaderVector: {
      cControl: leaderVector.cControl,
      aQualityAmbiguity: leaderVector.aQualityAmbiguity,
      fFinancialIndependence: leaderVector.fFinancialIndependence,
      socialScore: leaderVector.socialScore,
    },
    memberVector: {
      cControl: memberVector.cControl,
      aQualityAmbiguity: memberVector.aQualityAmbiguity,
      fFinancialIndependence: memberVector.fFinancialIndependence,
      socialScore: memberVector.socialScore,
    },
  };

  const highlights: string[] = [];
  const warnings: string[] = [];

  if (teamworkFitPoints >= 20) {
    highlights.push('组队契约分工高度互补，团队决策飞轮预期顺畅。');
  } else if (teamworkFitPoints <= -10) {
    warnings.push('双方主导倾向均强，存在「一山不容二虎」权力冲突风险。');
  }

  if (stressFitPoints <= -10) {
    warnings.push('品质底线与消费弹性差距较大，行中 Plan B 决策易起摩擦。');
  } else if (stressFitPoints >= -3) {
    highlights.push('抗压与品质底线对齐良好，行中变阵预期一致。');
  }

  if (synergy.narrative) {
    highlights.push(synergy.narrative);
  }

  if (chemistry) {
    highlights.push(`【${chemistry.script.title}】${chemistry.script.narrative}`);
  } else if (industryAntiCluster.narrative && industryAntiCluster.crossIndustryBoost) {
    highlights.push(industryAntiCluster.narrative);
  }

  if (industryAntiCluster.sameIndustryPenalty && industryAntiCluster.narrative) {
    warnings.push(industryAntiCluster.narrative);
  }

  const insightDrawer = buildMatchInsightDrawer(
    leaderVector,
    memberVector,
    breakdown,
    input.teamworkStyle,
  );

  return {
    hardBlocked: false,
    hardGateReason: null,
    hardGateMessage: null,
    compatibilityPercent,
    breakdown,
    insightDrawer,
    highlights,
    warnings,
  };
}
