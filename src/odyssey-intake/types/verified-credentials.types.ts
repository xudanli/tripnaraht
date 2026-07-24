/** PRD 3.1.2 + 3.1.3 — 学历认证（脱敏标签，不存校名） */
export type EducationDegreeLevel = 'bachelor' | 'master' | 'doctor';

export type EducationTierTag = '985_211' | 'qs_top50' | 'overseas' | 'general';

export type EducationVerificationChannel = 'xuexin_online_code';

export type ProfessionVerificationChannel =
  | 'work_email'
  | 'badge_ocr'
  | 'oauth_maimai'
  | 'oauth_linkedin';

export type ProfessionIndustryTag =
  | 'tech'
  | 'finance'
  | 'consulting'
  | 'manufacturing'
  | 'creative'
  | 'other';

export type CompanyTierTag =
  | 'tier1_tech'
  | 'tier1_finance'
  | 'tier1_consulting'
  | 'known_manufacturing'
  | 'growth_company'
  | 'general';

export type ProfessionRoleLevelTag =
  | 'product_director'
  | 'senior_expert'
  | 'manager'
  | 'specialist'
  | 'employee'
  | 'solutions_expert';

/** PRD 3.1.3 — 前端必须用矢量/水印渲染 */
export interface VerifiedBadgeMeta {
  verified: boolean;
  badgeLabel: '已认证';
  badgeMark: '✓';
  renderHint: 'vector_component_watermark';
}

export interface VerifiedEducationCredential {
  verified: boolean;
  degreeLevel: EducationDegreeLevel;
  tierTag: EducationTierTag;
  displayTag: string;
  verificationChannel: EducationVerificationChannel;
  badge: VerifiedBadgeMeta;
  verifiedAt: string;
}

export interface VerifiedProfessionCredential {
  verified: boolean;
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
  verificationChannel: ProfessionVerificationChannel;
  displayTags: string[];
  badge: VerifiedBadgeMeta;
  verifiedAt: string;
}

export interface VerifiedCredentialsBundle {
  education?: VerifiedEducationCredential;
  profession?: VerifiedProfessionCredential;
  updatedAt?: string;
}

export interface VerifiedCredentialsHeadlineView {
  displayName: string | null;
  identityHeadline: string | null;
  professionTags: string[];
  educationTags: string[];
  sesameCreditLine: string | null;
  trustAssetLine: string | null;
}

export interface VerifiedCredentialsDossierView {
  education: {
    displayTag: string;
    degreeLevel: EducationDegreeLevel;
    tierTag: EducationTierTag;
    verified: boolean;
    badge: VerifiedBadgeMeta;
    verificationChannel: EducationVerificationChannel;
  } | null;
  profession: {
    displayTags: string[];
    industryTag: ProfessionIndustryTag;
    companyTierTag: CompanyTierTag;
    roleLevelTag: ProfessionRoleLevelTag;
    verified: boolean;
    badge: VerifiedBadgeMeta;
    verificationChannel: ProfessionVerificationChannel;
  } | null;
  sesameCredit: {
    score: number | null;
    label: string | null;
    tier: string | null;
    verified: boolean;
  } | null;
  reputationStars: number | null;
  safetyNote: string | null;
}

export interface VerifiedCredentialsView {
  headline: VerifiedCredentialsHeadlineView;
  dossier: VerifiedCredentialsDossierView;
}
