import type { OdysseyIntakeProfile, OdysseyRawScores } from '../../odyssey-intake/types/odyssey-intake.types';
import type {
  EducationDegreeLevel,
  EducationTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
  VerifiedCredentialsBundle,
} from '../../odyssey-intake/types/verified-credentials.types';
import type { SocialBackgroundProfile } from './social-background-matching.engine';

/** U = [M₁₋₄, E₁₋₂, P₁₋₂, C, A, F] — Decision OS 特征向量 */
export interface UserFeatureVector {
  mbtiType: string;
  /** E/I, N/S, T/F, J/P 四维 0|1 */
  mbtiOneHot: [number, number, number, number];
  /** 学历层级分：未认证≈1，本科=3，硕士=5，博士=6 */
  e1EducationLevel: number;
  /** 学校档次分：普通=1，211=3，985=4，QS50/海归=5 */
  e2SchoolTier: number;
  /** 行业圈层码（归一化 1–5） */
  p1IndustryCode: number;
  /** 职级权重：基层=1，资深=3，总监/高管=5 */
  p2RoleWeight: number;
  /** 控制欲 C：全托管≈10，一起策划≈5，随便玩≈1 */
  cControl: number;
  /** 品质底线/不确定性 A：品质优先≈10，安全优先≈1 */
  aQualityAmbiguity: number;
  /** 财务弹性/悦己 F：极致悦己≈10，团队妥协≈1 */
  fFinancialIndependence: number;
  /** 沟通带宽复合分 E₁×E₂×P₂ */
  socialScore: number;
  isPremiumProfile: boolean;
}

function mbtiOneHot(mbtiType: string): [number, number, number, number] {
  const t = mbtiType.toUpperCase().padEnd(4, 'I');
  return [
    t[0] === 'E' ? 1 : 0,
    t[1] === 'N' ? 1 : 0,
    t[2] === 'T' ? 1 : 0,
    t[3] === 'J' ? 1 : 0,
  ];
}

function scoreEducationLevel(degree?: EducationDegreeLevel): number {
  if (degree === 'doctor') return 6;
  if (degree === 'master') return 5;
  if (degree === 'bachelor') return 3;
  return 1;
}

function scoreSchoolTier(tier?: EducationTierTag): number {
  if (tier === '985_211') return 4;
  if (tier === 'qs_top50' || tier === 'overseas') return 5;
  if (tier === 'general') return 1;
  return 1;
}

function scoreIndustryCode(tag?: ProfessionIndustryTag): number {
  switch (tag) {
    case 'tech':
      return 5;
    case 'finance':
      return 5;
    case 'consulting':
      return 4;
    case 'manufacturing':
      return 3;
    case 'creative':
      return 3;
    case 'other':
      return 2;
    default:
      return 1;
  }
}

function scoreRoleWeight(role?: ProfessionRoleLevelTag): number {
  switch (role) {
    case 'product_director':
      return 5;
    case 'manager':
      return 4;
    case 'senior_expert':
    case 'solutions_expert':
      return 3;
    case 'specialist':
    case 'employee':
      return 1;
    default:
      return 1;
  }
}

function isPremiumRawScores(scores: OdysseyRawScores): boolean {
  return (
    scores.control_desire !== 0 ||
    scores.collaborative_trait !== 0 ||
    scores.quality_baseline !== 0 ||
    scores.financial_elasticity !== 0 ||
    scores.safety_first !== 0
  );
}

/** Premium Stress Test → C / A / F（1–10） */
export function mapPremiumStressTraits(scores: OdysseyRawScores): {
  cControl: number;
  aQualityAmbiguity: number;
  fFinancialIndependence: number;
} {
  let cControl = 5;
  if (scores.control_desire >= 2) cControl = 10;
  else if (scores.collaborative_trait >= 2) cControl = 5;
  else if (scores.compromise_index >= 2 || scores.safety_first >= 2) cControl = 1;

  let aQualityAmbiguity = 5;
  if (scores.quality_baseline >= 2 || scores.risk_appetite >= 2) aQualityAmbiguity = 10;
  else if (scores.safety_first >= 2 || scores.ambiguity_tolerance >= 2) aQualityAmbiguity = 1;

  let fFinancialIndependence = 5;
  if (scores.financial_elasticity >= 2 && scores.independence >= 2) fFinancialIndependence = 10;
  else if (scores.compromise_index >= 2) fFinancialIndependence = 1;

  return { cControl, aQualityAmbiguity, fFinancialIndependence };
}

/** v1 画像回退：从 MBTI 维度与旧 rawScores 近似映射 */
function mapLegacyTraits(
  scores: OdysseyRawScores,
  dimensionPercents: { J: number; P: number },
): { cControl: number; aQualityAmbiguity: number; fFinancialIndependence: number } {
  const cControl = dimensionPercents.J >= 70 ? 8 : dimensionPercents.P >= 70 ? 2 : 5;
  const aQualityAmbiguity =
    scores.ambiguity_tolerance >= 2 ? 3 : scores.ambiguity_tolerance <= -2 ? 8 : 5;
  const fFinancialIndependence =
    scores.financial_flexibility >= 2 ? 8 : scores.financial_flexibility <= -2 ? 2 : 5;
  return { cControl, aQualityAmbiguity, fFinancialIndependence };
}

export function buildUserFeatureVector(input: {
  mbtiType: string;
  rawScores: OdysseyRawScores;
  dimensionPercents?: { J: number; P: number };
  credentials?: VerifiedCredentialsBundle | null;
  social?: SocialBackgroundProfile | null;
}): UserFeatureVector {
  const premium = isPremiumRawScores(input.rawScores);
  const traits = premium
    ? mapPremiumStressTraits(input.rawScores)
    : mapLegacyTraits(
        input.rawScores,
        input.dimensionPercents ?? { J: 50, P: 50 },
      );

  const degree =
    input.credentials?.education?.degreeLevel ?? input.social?.educationDegree;
  const tier = input.credentials?.education?.tierTag ?? input.social?.educationTier;
  const industry =
    input.credentials?.profession?.industryTag ?? input.social?.professionIndustry;
  const role = input.credentials?.profession?.roleLevelTag;

  const e1 = scoreEducationLevel(degree);
  const e2 = scoreSchoolTier(tier);
  const p1 = scoreIndustryCode(industry);
  const p2 = scoreRoleWeight(role);

  const hasCredentialBacking = Boolean(
    input.credentials?.education?.verifiedAt || input.credentials?.profession?.verifiedAt,
  );
  const effectiveE1 = hasCredentialBacking ? e1 : 1;
  const effectiveE2 = hasCredentialBacking ? e2 : 1;
  const effectiveP2 = hasCredentialBacking ? p2 : 1;

  return {
    mbtiType: input.mbtiType.toUpperCase(),
    mbtiOneHot: mbtiOneHot(input.mbtiType),
    e1EducationLevel: effectiveE1,
    e2SchoolTier: effectiveE2,
    p1IndustryCode: p1,
    p2RoleWeight: effectiveP2,
    ...traits,
    socialScore: effectiveE1 * effectiveE2 * effectiveP2,
    isPremiumProfile: premium,
  };
}

export function buildUserFeatureVectorFromIntake(
  profile: OdysseyIntakeProfile,
  credentials?: VerifiedCredentialsBundle | null,
  social?: SocialBackgroundProfile | null,
): UserFeatureVector {
  return buildUserFeatureVector({
    mbtiType: profile.mbtiType,
    rawScores: profile.rawScores,
    dimensionPercents: profile.dimensionPercents,
    credentials,
    social,
  });
}

/** 将 socialScore 映射到 0–5 圈层 tier，供 Hard Gate 使用 */
export function socialScoreToTier(socialScore: number): number {
  if (socialScore >= 75) return 5;
  if (socialScore >= 50) return 4;
  if (socialScore >= 30) return 3;
  if (socialScore >= 15) return 2;
  if (socialScore >= 5) return 1;
  return 0;
}
