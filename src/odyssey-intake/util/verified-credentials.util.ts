import type {
  CompanyTierTag,
  EducationDegreeLevel,
  EducationTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
  ProfessionVerificationChannel,
  VerifiedBadgeMeta,
  VerifiedCredentialsBundle,
  VerifiedCredentialsView,
  VerifiedEducationCredential,
  VerifiedProfessionCredential,
} from '../types/verified-credentials.types';
import type { OdysseyTrustVerification } from '../types/odyssey-intake-ext.types';
import {
  VERIFIED_BADGE_META,
  buildEducationVerifiedDisplayTag,
  buildFuzzyProfessionDisplayTags,
} from './credential-privacy-tags.util';

export function parseVerifiedCredentialsBundle(raw: unknown): VerifiedCredentialsBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  return migrateLegacyCredentialsBundle(raw as Record<string, unknown>);
}

/** 兼容 §3.1.2 旧数据：读取时迁移为模糊标签 + badge */
function migrateLegacyCredentialsBundle(raw: Record<string, unknown>): VerifiedCredentialsBundle {
  const bundle = { ...raw } as VerifiedCredentialsBundle;

  if (bundle.education && !bundle.education.badge) {
    bundle.education = normalizeEducationCredential({
      degreeLevel: bundle.education.degreeLevel,
      tierTag: bundle.education.tierTag,
    });
  }

  if (bundle.profession && !bundle.profession.badge) {
    const legacy = bundle.profession as VerifiedProfessionCredential & {
      roleDisplayTag?: string;
      skillDisplayTag?: string;
    };
    const roleLevelTag =
      legacy.roleLevelTag ??
      inferLegacyRoleLevel(legacy.roleDisplayTag ?? legacy.displayTags?.[0] ?? '');
    bundle.profession = normalizeProfessionCredential({
      channel: legacy.verificationChannel ?? 'work_email',
      industryTag: legacy.industryTag,
      companyTierTag: legacy.companyTierTag ?? 'general',
      roleLevelTag,
    });
  }

  return bundle;
}

function inferLegacyRoleLevel(label: string): ProfessionRoleLevelTag {
  const t = label.toLowerCase();
  if (/总监|director/.test(t)) return 'product_director';
  if (/专家|expert/.test(t)) return 'senior_expert';
  if (/经理|manager/.test(t)) return 'manager';
  if (/工程师|engineer|分析师/.test(t)) return 'specialist';
  return 'employee';
}

export function buildSesameCreditLine(trust: OdysseyTrustVerification | null): string | null {
  if (!trust?.verified || trust.provider !== 'zhima_credit') return null;
  const score = trust.creditScore;
  const label = trust.creditScoreLabel ?? tierToLabel(trust.creditScoreTier);
  if (score != null && label) return `🛡️ 芝麻信用 ${score} (${label})`;
  if (label) return `🛡️ 芝麻信用 (${label})`;
  return trust.verified ? '🛡️ 芝麻信用已授权' : null;
}

function tierToLabel(tier?: OdysseyTrustVerification['creditScoreTier']): string | null {
  if (tier === 'excellent') return '极佳';
  if (tier === 'good') return '良好';
  if (tier === 'fair') return '一般';
  return null;
}

export function buildVerifiedCredentialsView(input: {
  trust: OdysseyTrustVerification | null;
  credentials: VerifiedCredentialsBundle | null;
  reputationStars?: number | null;
  safetyNote?: string | null;
  teamworkStyleCapsule?: string | null;
}): VerifiedCredentialsView {
  const displayName = input.trust?.displayName ?? null;
  const professionTags = input.credentials?.profession?.displayTags ?? [];
  const educationTags = input.credentials?.education?.displayTag
    ? [input.credentials.education.displayTag]
    : [];

  const namePart = displayName ?? '队长';
  const tagParts = [...professionTags, ...educationTags];
  const identityHeadline =
    tagParts.length > 0 ? `${namePart} · ${tagParts.join(' · ')}` : displayName;

  const sesameCreditLine = buildSesameCreditLine(input.trust);
  const trustParts = [sesameCreditLine, input.teamworkStyleCapsule].filter(Boolean);
  const trustAssetLine = trustParts.length > 0 ? trustParts.join(' · ') : null;

  return {
    headline: {
      displayName,
      identityHeadline,
      professionTags,
      educationTags,
      sesameCreditLine,
      trustAssetLine,
    },
    dossier: {
      education: input.credentials?.education
        ? {
            displayTag: input.credentials.education.displayTag,
            degreeLevel: input.credentials.education.degreeLevel,
            tierTag: input.credentials.education.tierTag,
            verified: input.credentials.education.verified,
            badge: input.credentials.education.badge,
            verificationChannel: input.credentials.education.verificationChannel,
          }
        : null,
      profession: input.credentials?.profession
        ? {
            displayTags: input.credentials.profession.displayTags,
            industryTag: input.credentials.profession.industryTag,
            companyTierTag: input.credentials.profession.companyTierTag,
            roleLevelTag: input.credentials.profession.roleLevelTag,
            verified: input.credentials.profession.verified,
            badge: input.credentials.profession.badge,
            verificationChannel: input.credentials.profession.verificationChannel,
          }
        : null,
      sesameCredit: input.trust?.verified
        ? {
            score: input.trust.creditScore ?? null,
            label: input.trust.creditScoreLabel ?? tierToLabel(input.trust.creditScoreTier),
            tier: input.trust.creditScoreTier ?? null,
            verified: true,
          }
        : null,
      reputationStars: input.reputationStars ?? null,
      safetyNote: input.safetyNote ?? null,
    },
  };
}

export function normalizeEducationCredential(input: {
  degreeLevel: EducationDegreeLevel;
  tierTag: EducationTierTag;
}): VerifiedEducationCredential {
  return {
    verified: true,
    degreeLevel: input.degreeLevel,
    tierTag: input.tierTag,
    displayTag: buildEducationVerifiedDisplayTag(input.degreeLevel, input.tierTag),
    verificationChannel: 'xuexin_online_code',
    badge: VERIFIED_BADGE_META,
    verifiedAt: new Date().toISOString(),
  };
}

export function normalizeProfessionCredential(input: {
  channel: ProfessionVerificationChannel;
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}): VerifiedProfessionCredential {
  const displayTags = buildFuzzyProfessionDisplayTags({
    industryTag: input.industryTag,
    companyTierTag: input.companyTierTag,
    roleLevelTag: input.roleLevelTag,
  });

  return {
    verified: true,
    industryTag: input.industryTag,
    companyTierTag: input.companyTierTag,
    roleLevelTag: input.roleLevelTag,
    verificationChannel: input.channel,
    displayTags,
    badge: VERIFIED_BADGE_META,
    verifiedAt: new Date().toISOString(),
  };
}

/** @deprecated 使用 buildEducationVerifiedDisplayTag */
export function buildEducationDisplayTag(
  degreeLevel: EducationDegreeLevel,
  tierTag: EducationTierTag,
): string {
  return buildEducationVerifiedDisplayTag(degreeLevel, tierTag);
}

export { VERIFIED_BADGE_META };
