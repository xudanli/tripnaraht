import type { ProfessionIndustryTag } from '../../odyssey-intake/types/verified-credentials.types';
import type { MatchableProfile } from '../../odyssey-intake/engine/companion-matching.engine';
import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';
import type { SocialBackgroundProfile } from './social-background-matching.engine';
import {
  isHighEnergyElasticMember,
  isInternetWhiteCollar,
  resolveCrossCirclePuzzleSlot,
  type CrossCircleChemistryScriptId,
} from './cross-circle-chemistry.engine';
import { buildUserFeatureVector } from './user-feature-vector.engine';

export type PuzzleDeficitDimension =
  | 'energy_balance'
  | 'risk_resilience'
  | 'trust_alignment'
  | 'collaboration_fit'
  | 'cross_circle_chemistry'
  | 'preference';

export interface TeamPuzzleDeficitSpec {
  deficitDimension: PuzzleDeficitDimension;
  shortLabel: string;
  aiRationale: string;
  targetMbtiTypes: string[];
  minEducationTier?: 'bachelor_plus' | 'master_plus';
  targetCollaborationGenes?: Array<
    'full_managed_leader' | 'co_planning_partner' | 'passive_experiencer' | 'team_compromiser'
  >;
  chemistryScriptId?: CrossCircleChemistryScriptId;
  targetCrossIndustries?: ProfessionIndustryTag[];
}

export interface TeamPuzzleBuildContext {
  travelMode: string | null;
  vehicleInfo: string | null;
  preferenceNotes: string | null;
  captainMessage: string | null;
  captainSocial?: SocialBackgroundProfile | null;
  teamworkStyle?: RecruitmentPlanningStyle | null;
}

const ENERGY_E_ARCHETYPES = [
  { types: ['ENFP', 'ENTP'], label: '满血复活的社交气氛组' },
  { types: ['ESFP', 'ESTP'], label: '对外沟通推进型队友' },
];

const RISK_P_ARCHETYPES = [
  { types: ['ENFP', 'ENTP', 'ESFP'], label: '🎭 随性体验者 · 高弹性应急' },
  { types: ['ISFP', 'INFP'], label: '🎭 随性体验者 · 质感跟随型' },
];

const FULL_MANAGED_EXECUTOR = {
  types: ['ISFP', 'ESFP', 'INFP', 'ISFJ'],
  label: '🛡️ 乐意接受全托管的靠谱执行者',
};

function captainIsIntrovertHeavy(snapshot: CaptainPersonaSnapshot): boolean {
  return snapshot.dimensionPercents.I >= 55 || snapshot.dimensionPercents.E <= 45;
}

function captainIsLowAmbiguityTolerance(snapshot: CaptainPersonaSnapshot): boolean {
  return (
    snapshot.rawScores.ambiguity_tolerance <= 0 ||
    snapshot.rawScores.safety_first >= 2 ||
    snapshot.dimensionPercents.J >= 60 ||
    snapshot.rawScores.stress_anxiety_index >= 1
  );
}

function captainIsFullManagedLeader(snapshot: CaptainPersonaSnapshot): boolean {
  return snapshot.rawScores.control_desire >= 2;
}

function captainHasQualityBaseline(snapshot: CaptainPersonaSnapshot): boolean {
  return snapshot.rawScores.quality_baseline >= 2;
}

function captainNeedsTrustAlignedMate(ctx: TeamPuzzleBuildContext): boolean {
  const isSelfDrive = ctx.travelMode === 'self_drive' || /自驾|开车|车主|宝马|奔驰|suv/i.test(
    `${ctx.vehicleInfo ?? ''} ${ctx.preferenceNotes ?? ''}`,
  );
  const captainTier =
    ctx.captainSocial?.educationTier != null &&
    ctx.captainSocial.educationTier !== 'general';
  const captainIndustry = ctx.captainSocial?.professionIndustry != null;
  return isSelfDrive || captainTier || captainIndustry;
}

function trustSlotLabel(ctx: TeamPuzzleBuildContext): string {
  const industry = ctx.captainSocial?.professionIndustry;
  if (industry === 'tech') return '🎓 本科以上认证 · 泛科技圈高信用队友';
  if (industry === 'finance') return '🎓 本科以上认证 · 金融圈高信用队友';
  if (industry === 'manufacturing') return '🎓 本科以上认证 · 成熟职场硬核队友';
  if (/宝马|奔驰|特斯拉|suv|越野/i.test(ctx.vehicleInfo ?? '')) {
    return '🎓 本科以上认证 · 高信用背书的老司机';
  }
  return '🎓 本科以上认证 · 同圈层成熟旅伴';
}

/** POMDP-inspired 团队缺位：协作基因 → E/I → 风险韧性 → 信任圈层 */
export function computeTeamPuzzleDeficits(
  snapshot: CaptainPersonaSnapshot,
  ctx: TeamPuzzleBuildContext,
  openCount: number,
): TeamPuzzleDeficitSpec[] {
  if (openCount <= 0) return [];

  const pool: TeamPuzzleDeficitSpec[] = [];
  const isFullManagedPost = ctx.teamworkStyle === 'full_managed';
  const captainIndustry = ctx.captainSocial?.professionIndustry;

  const crossCircleScript = resolveCrossCirclePuzzleSlot({
    captainMbti: snapshot.mbtiType,
    captainIndustry,
  });
  if (crossCircleScript) {
    pool.push({
      deficitDimension: 'cross_circle_chemistry',
      shortLabel: crossCircleScript.puzzleLabel,
      aiRationale: crossCircleScript.puzzleRationale,
      targetMbtiTypes: crossCircleScript.memberMbtiTypes,
      minEducationTier: 'bachelor_plus',
      chemistryScriptId: crossCircleScript.id,
      targetCrossIndustries: crossCircleScript.memberIndustries,
      targetCollaborationGenes: ['passive_experiencer'],
    });
  }

  if (isFullManagedPost && captainIsFullManagedLeader(snapshot)) {
    pool.push({
      deficitDimension: 'collaboration_fit',
      shortLabel: FULL_MANAGED_EXECUTOR.label,
      aiRationale:
        '队长为全托管主导型（强力接管基因），建议补位学历背书清晰、乐意跟随执行的体验型队友，降低行中决策摩擦',
      targetMbtiTypes: FULL_MANAGED_EXECUTOR.types,
      minEducationTier: 'bachelor_plus',
      targetCollaborationGenes: ['passive_experiencer', 'team_compromiser'],
    });
  } else if (ctx.teamworkStyle === 'co_planning' || snapshot.rawScores.collaborative_trait >= 2) {
    pool.push({
      deficitDimension: 'collaboration_fit',
      shortLabel: '🤝 一起策划 · 共创型合伙人',
      aiRationale: '队长偏好协同分工，建议补位愿意行前共担、行中 democratic 决策的共创型队友',
      targetMbtiTypes: ['ENTJ', 'ESTJ', 'ENFJ', 'INFJ'],
      targetCollaborationGenes: ['co_planning_partner'],
    });
  }

  if (captainIsIntrovertHeavy(snapshot)) {
    const pick = ENERGY_E_ARCHETYPES[0];
    pool.push({
      deficitDimension: 'energy_balance',
      shortLabel: pick.label,
      aiRationale: '队长偏内向，建议补位一位 E 人承担对外沟通，团队能量更均衡',
      targetMbtiTypes: pick.types,
    });
  }

  if (captainIsLowAmbiguityTolerance(snapshot) || captainHasQualityBaseline(snapshot)) {
    const pick = captainHasQualityBaseline(snapshot)
      ? RISK_P_ARCHETYPES[1]
      : RISK_P_ARCHETYPES[0];
    pool.push({
      deficitDimension: 'risk_resilience',
      shortLabel: pick.label,
      aiRationale: captainHasQualityBaseline(snapshot)
        ? '队长有品质底线且偏秩序，需一位高弹性 P 人承接行中 Plan B 与临时变阵'
        : '队长偏秩序与低风险，需一位不确定性容忍更高的队友应对行中意外',
      targetMbtiTypes: pick.types,
      targetCollaborationGenes: ['passive_experiencer'],
    });
  }

  if (captainNeedsTrustAlignedMate(ctx) && !isInternetWhiteCollar(captainIndustry)) {
    pool.push({
      deficitDimension: 'trust_alignment',
      shortLabel: trustSlotLabel(ctx),
      aiRationale: '长途高压场景下，建议同圈层、高信用背书的队员降低隐性认知摩擦',
      targetMbtiTypes: ['INTJ', 'ENTJ', 'ISTJ', 'ESTJ'],
      minEducationTier: 'bachelor_plus',
    });
  } else if (captainNeedsTrustAlignedMate(ctx) && isInternetWhiteCollar(captainIndustry)) {
    pool.push({
      deficitDimension: 'trust_alignment',
      shortLabel: '🎓 硕士以上认证 · 跨界硬背书队友',
      aiRationale:
        '保持社会化成熟度对齐（学历/信用同档），但行业 Anti-Clustering 优先非互联网背景',
      targetMbtiTypes: [],
      minEducationTier: 'master_plus',
      targetCrossIndustries: ['creative', 'manufacturing', 'other'],
    });
  }

  while (pool.length < openCount) {
    pool.push({
      deficitDimension: 'preference',
      shortLabel: `旅伴拼图位 ${pool.length + 1}`,
      aiRationale: '根据队长偏好与行程约束动态补位',
      targetMbtiTypes: [],
    });
  }

  return pool.slice(0, openCount);
}

export function scoreViewerAgainstDeficit(
  viewer: MatchableProfile,
  spec: TeamPuzzleDeficitSpec,
  captain: CaptainPersonaSnapshot,
): number {
  let score = 40;

  if (spec.targetMbtiTypes.some((t) => viewer.mbtiType.startsWith(t.slice(0, 2)) || viewer.mbtiType === t)) {
    score += 35;
  }

  switch (spec.deficitDimension) {
    case 'energy_balance':
      if (viewer.dimensionPercents.E >= 55) score += 25;
      if (captain.dimensionPercents.I >= 55 && viewer.dimensionPercents.E >= 50) score += 10;
      break;
    case 'risk_resilience':
      if (viewer.dimensionPercents.P >= 55) score += 25;
      if (viewer.rawScores.ambiguity_tolerance >= 1 || viewer.rawScores.risk_appetite >= 1) score += 15;
      if (viewer.dimensionPercents.T >= 50) score += 10;
      break;
    case 'trust_alignment':
      if (viewer.dimensionPercents.J >= 50) score += 15;
      if (/自驾|司机|驾驶|drive/i.test(viewer.cardTitle)) score += 15;
      break;
    case 'collaboration_fit':
      if (viewer.rawScores.control_desire <= 0 && viewer.dimensionPercents.P >= 55) score += 25;
      if (viewer.rawScores.collaborative_trait >= 2) score += 15;
      if (viewer.rawScores.compromise_index >= 2) score += 10;
      break;
    case 'cross_circle_chemistry':
      if (spec.targetMbtiTypes.includes(viewer.mbtiType)) score += 30;
      if (viewer.dimensionPercents.P >= 55 || viewer.dimensionPercents.E >= 55) score += 15;
      if (viewer.rawScores.risk_appetite >= 1 || viewer.rawScores.ambiguity_tolerance >= 1) {
        score += 10;
      }
      if (
        isHighEnergyElasticMember(
          buildUserFeatureVector({
            mbtiType: viewer.mbtiType,
            rawScores: viewer.rawScores,
            dimensionPercents: viewer.dimensionPercents,
          }),
          viewer.dimensionPercents,
          viewer.rawScores,
        )
      ) {
        score += 10;
      }
      break;
    default:
      break;
  }

  return Math.min(99, Math.max(0, score));
}

export function formatSuggestedRoleLabel(shortLabel: string): string {
  return shortLabel.startsWith('建议补位') ? shortLabel : `建议补位 · ${shortLabel}`;
}
