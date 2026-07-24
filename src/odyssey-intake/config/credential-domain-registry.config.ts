import type {
  CompanyTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
} from '../types/verified-credentials.types';

export interface WorkEmailDomainProfile {
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
}

/** PRD 3.1.3 — 企业邮箱二级域名 → 行业/层级（不存公司全称） */
export const WORK_EMAIL_DOMAIN_REGISTRY: Record<string, WorkEmailDomainProfile> = {
  'tencent.com': { industryTag: 'tech', companyTierTag: 'tier1_tech' },
  'qq.com': { industryTag: 'tech', companyTierTag: 'tier1_tech' },
  'alibaba-inc.com': { industryTag: 'tech', companyTierTag: 'tier1_tech' },
  'aliyun.com': { industryTag: 'tech', companyTierTag: 'tier1_tech' },
  'bytedance.com': { industryTag: 'tech', companyTierTag: 'tier1_tech' },
  'deloitte.com': { industryTag: 'consulting', companyTierTag: 'tier1_consulting' },
  'mckinsey.com': { industryTag: 'consulting', companyTierTag: 'tier1_consulting' },
  'gs.com': { industryTag: 'finance', companyTierTag: 'tier1_finance' },
  'cicc.com.cn': { industryTag: 'finance', companyTierTag: 'tier1_finance' },
  'deli.com': { industryTag: 'manufacturing', companyTierTag: 'known_manufacturing' },
  'huazheng.com.cn': { industryTag: 'manufacturing', companyTierTag: 'known_manufacturing' },
};

export function resolveWorkEmailDomain(email: string): WorkEmailDomainProfile | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return null;
  const domain = normalized.slice(at + 1);
  return WORK_EMAIL_DOMAIN_REGISTRY[domain] ?? null;
}

export function inferRoleLevelFromTitle(title: string): ProfessionRoleLevelTag {
  const t = title.toLowerCase();
  if (/总监|director|head of|vp/.test(t)) return 'product_director';
  if (/专家|expert|principal|架构|architect/.test(t)) return 'senior_expert';
  if (/经理|manager|lead/.test(t)) return 'manager';
  if (/工程师|engineer|分析师|analyst|专员|specialist/.test(t)) return 'specialist';
  return 'employee';
}
