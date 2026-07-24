import type {
  CompanyTierTag,
  EducationDegreeLevel,
  EducationTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
  VerifiedBadgeMeta,
} from '../types/verified-credentials.types';

const INDUSTRY_ICON: Record<ProfessionIndustryTag, string> = {
  tech: '👨‍💻',
  finance: '💼',
  consulting: '📊',
  manufacturing: '🏭',
  creative: '🎨',
  other: '💼',
};

const INDUSTRY_FUZZY: Record<ProfessionIndustryTag, string> = {
  tech: '泛科技',
  finance: '金融',
  consulting: '咨询',
  manufacturing: '知名制造集团',
  creative: '创意',
  other: '综合',
};

const COMPANY_TIER_FUZZY: Record<CompanyTierTag, string> = {
  tier1_tech: '头部大厂',
  tier1_finance: '头部金融机构',
  tier1_consulting: '头部咨询',
  known_manufacturing: '知名制造集团',
  growth_company: '成长型企业',
  general: '在职员工',
};

const ROLE_LEVEL_FUZZY: Record<ProfessionRoleLevelTag, string> = {
  product_director: '产品总监',
  senior_expert: '资深专家',
  manager: '团队负责人',
  specialist: '专业骨干',
  employee: '在职员工',
  solutions_expert: '解决方案专家',
};

const DEGREE_LABEL: Record<EducationDegreeLevel, string> = {
  bachelor: '本科',
  master: '硕士',
  doctor: '博士',
};

const TIER_PUBLIC: Record<EducationTierTag, string | null> = {
  '985_211': '985/211',
  qs_top50: 'QS Top 50',
  overseas: null,
  general: null,
};

export const VERIFIED_BADGE_META: VerifiedBadgeMeta = {
  verified: true,
  badgeLabel: '已认证',
  badgeMark: '✓',
  renderHint: 'vector_component_watermark',
};

export function appendVerifiedSuffix(label: string): string {
  return label.includes('已认证') ? label : `${label}(已认证)`;
}

/** PRD 3.1.3 — 学历外显：优先展示档次标签 */
export function buildEducationVerifiedDisplayTag(
  degreeLevel: EducationDegreeLevel,
  tierTag: EducationTierTag,
): string {
  const tierPublic = TIER_PUBLIC[tierTag];
  if (tierPublic) {
    return appendVerifiedSuffix(`🎓 ${tierPublic}`);
  }
  if (tierTag === 'overseas') {
    return appendVerifiedSuffix(`🎓 ${DEGREE_LABEL[degreeLevel]}(海归)`);
  }
  return appendVerifiedSuffix(`🎓 ${DEGREE_LABEL[degreeLevel]}`);
}

/** PRD 3.1.3 — 工作资历模糊标签，禁止公司全称 */
export function buildFuzzyProfessionDisplayTag(input: {
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}): string {
  const icon = INDUSTRY_ICON[input.industryTag];
  const industry = INDUSTRY_FUZZY[input.industryTag];

  const role = ROLE_LEVEL_FUZZY[input.roleLevelTag];
  const tier = COMPANY_TIER_FUZZY[input.companyTierTag];

  // 邮箱通道仅有行业+层级时：泛科技·头部大厂
  if (input.roleLevelTag === 'employee' && input.companyTierTag !== 'general') {
    return appendVerifiedSuffix(`${icon} ${industry}·${tier}`);
  }

  // 有职级时：泛科技·产品总监 / 知名制造集团·解决方案专家
  if (input.industryTag === 'manufacturing') {
    return appendVerifiedSuffix(`${icon} ${industry}·${role}`);
  }

  return appendVerifiedSuffix(`${icon} ${industry}·${role}`);
}

export function buildFuzzyProfessionDisplayTags(input: {
  industryTag: ProfessionIndustryTag;
  companyTierTag: CompanyTierTag;
  roleLevelTag: ProfessionRoleLevelTag;
}): string[] {
  return [buildFuzzyProfessionDisplayTag(input)];
}
