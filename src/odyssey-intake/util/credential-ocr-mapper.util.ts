import type {
  CompanyTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
} from '../types/verified-credentials.types';
import { inferRoleLevelFromTitle } from '../config/credential-domain-registry.config';

export interface OcrProfessionMapping {
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}

/** OCR 文本 → 模糊行业/职级（严禁输出公司全称到前端） */
export function mapOcrTextToProfessionProfile(ocrText: string): OcrProfessionMapping {
  const text = ocrText.toLowerCase();
  const roleLevelTag = inferRoleLevelFromTitle(ocrText);

  if (/制造|工业|集团|motor|manufacturing|广联|得力|deli/.test(text)) {
    return {
      industryTag: 'manufacturing',
      companyTierTag: 'known_manufacturing',
      roleLevelTag: roleLevelTag === 'employee' ? 'solutions_expert' : roleLevelTag,
    };
  }

  if (/腾讯|tencent|阿里|alibaba|字节|bytedance|百度|baidu|华为|huawei|美团|meituan/.test(text)) {
    return {
      industryTag: 'tech',
      companyTierTag: 'tier1_tech',
      roleLevelTag,
    };
  }

  if (/高盛|goldman|摩根|morgan|中金|cicc|证券|bank|finance/.test(text)) {
    return {
      industryTag: 'finance',
      companyTierTag: 'tier1_finance',
      roleLevelTag,
    };
  }

  if (/麦肯锡|mckinsey|德勤|deloitte|咨询|consult/.test(text)) {
    return {
      industryTag: 'consulting',
      companyTierTag: 'tier1_consulting',
      roleLevelTag,
    };
  }

  if (/设计|创意|design|creative|广告|agency/.test(text)) {
    return {
      industryTag: 'creative',
      companyTierTag: 'growth_company',
      roleLevelTag,
    };
  }

  return {
    industryTag: 'other',
    companyTierTag: 'general',
    roleLevelTag,
  };
}
