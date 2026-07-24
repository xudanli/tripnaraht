import type {
  EducationDegreeLevel,
  EducationTierTag,
  ProfessionIndustryTag,
  VerifiedCredentialsBundle,
} from '../../odyssey-intake/types/verified-credentials.types';
import type { OdysseyTrustVerification } from '../../odyssey-intake/types/odyssey-intake-ext.types';

export interface SocialBackgroundProfile {
  educationTier?: EducationTierTag;
  educationDegree?: EducationDegreeLevel;
  professionIndustry?: ProfessionIndustryTag;
  sesameCreditScore?: number | null;
  reputationStars?: number | null;
  fulfillmentBlocked?: boolean;
}

export interface SocialBackgroundMatchResult {
  hardBlocked: boolean;
  blockReason: string | null;
  bonusPercent: number;
  highlights: string[];
  warnings: string[];
}

const FULFILLMENT_BLOCK_REASON =
  '该用户履约背书未达平台安全阈值（芝麻信用极低或多次被投诉放鸽子），系统不予推荐。';

/** PRD 3.5.1 — 硬履约背书 Hard Gate */
export function failsFulfillmentHardGate(input: {
  trust: OdysseyTrustVerification | null;
  safetyWarning: string | null;
  internalRiskHigh?: boolean;
}): boolean {
  if (input.internalRiskHigh) return true;
  if (input.safetyWarning?.includes('放鸽子')) return true;

  const score = input.trust?.creditScore;
  if (input.trust?.provider === 'zhima_credit' && score != null && score < 550) {
    return true;
  }
  if (input.trust?.creditScoreTier === 'fair' && (score == null || score < 600)) {
    return true;
  }

  return false;
}

function educationBand(degree?: EducationDegreeLevel): number {
  if (degree === 'doctor') return 3;
  if (degree === 'master') return 2;
  if (degree === 'bachelor') return 1;
  return 0;
}

function industryCluster(tag?: ProfessionIndustryTag): string {
  if (!tag) return 'unknown';
  if (tag === 'tech' || tag === 'consulting') return 'white_collar';
  if (tag === 'finance') return 'finance';
  if (tag === 'manufacturing') return 'industrial';
  return tag;
}

/**
 * PRD 3.5.1 — 圈层同频度（Background Alignment）加成
 * 行业相近 +10，学历带宽对齐 +8，弱交集 +2
 */
export function computeSocialBackgroundAlignment(
  captain: SocialBackgroundProfile,
  viewer: SocialBackgroundProfile,
): SocialBackgroundMatchResult {
  if (captain.fulfillmentBlocked || viewer.fulfillmentBlocked) {
    return {
      hardBlocked: true,
      blockReason: FULFILLMENT_BLOCK_REASON,
      bonusPercent: 0,
      highlights: [],
      warnings: [FULFILLMENT_BLOCK_REASON],
    };
  }

  const highlights: string[] = [];
  const warnings: string[] = [];
  let bonusPercent = 0;

  const captainIndustry = industryCluster(captain.professionIndustry);
  const viewerIndustry = industryCluster(viewer.professionIndustry);
  if (
    captain.professionIndustry &&
    viewer.professionIndustry &&
    captainIndustry === viewerIndustry
  ) {
    bonusPercent += 10;
    highlights.push('行业/认知圈层相近，高压行中沟通成本预期更低。');
  } else if (captain.professionIndustry && viewer.professionIndustry) {
    bonusPercent += 2;
  }

  const captainBand = educationBand(captain.educationDegree);
  const viewerBand = educationBand(viewer.educationDegree);
  if (captain.educationDegree && viewer.educationDegree) {
    if (Math.abs(captainBand - viewerBand) <= 1) {
      bonusPercent += 8;
      highlights.push('学历层级/沟通带宽接近，讨论决策方式更易同频。');
    } else {
      bonusPercent += 2;
      warnings.push('学历层级差异较大，行前需额外对齐沟通预期。');
    }
  }

  if (
    captain.educationTier &&
    viewer.educationTier &&
    captain.educationTier === viewer.educationTier &&
    captain.educationTier !== 'general'
  ) {
    bonusPercent += 2;
  }

  return {
    hardBlocked: false,
    blockReason: null,
    bonusPercent,
    highlights,
    warnings,
  };
}

export function socialProfileFromCredentials(
  trust: OdysseyTrustVerification | null,
  credentials: VerifiedCredentialsBundle | null,
  extras?: { reputationStars?: number | null; fulfillmentBlocked?: boolean },
): SocialBackgroundProfile {
  return {
    educationTier: credentials?.education?.tierTag,
    educationDegree: credentials?.education?.degreeLevel,
    professionIndustry: credentials?.profession?.industryTag,
    sesameCreditScore: trust?.creditScore ?? null,
    reputationStars: extras?.reputationStars ?? null,
    fulfillmentBlocked: extras?.fulfillmentBlocked ?? false,
  };
}
