import type {
  CompanyTierTag,
  EducationDegreeLevel,
  EducationTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
  ProfessionVerificationChannel,
} from '../types/verified-credentials.types';

export interface XuexinVerificationResult {
  degreeLevel: EducationDegreeLevel;
  tierTag: EducationTierTag;
}

export interface ProfessionVerificationResult {
  channel: ProfessionVerificationChannel;
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}

export interface SendWorkEmailCodeResult {
  expiresInSeconds: number;
  devCode?: string;
}

export interface UploadBadgeImageResult {
  imageToken: string;
  expiresInSeconds: number;
}

export interface XuexinGatewayResponse {
  degreeLevel: EducationDegreeLevel;
  tierTag: EducationTierTag;
}

export interface OAuthGatewayResponse {
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}

export interface BadgeOcrGatewayResponse {
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}
