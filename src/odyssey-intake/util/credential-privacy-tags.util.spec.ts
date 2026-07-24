import {
  buildEducationVerifiedDisplayTag,
  buildFuzzyProfessionDisplayTag,
} from './credential-privacy-tags.util';

describe('credential privacy tags (PRD 3.1.3)', () => {
  it('prioritizes tier badge for 985/211', () => {
    expect(buildEducationVerifiedDisplayTag('bachelor', '985_211')).toBe('🎓 985/211(已认证)');
  });

  it('shows overseas degree without school name', () => {
    expect(buildEducationVerifiedDisplayTag('master', 'overseas')).toBe('🎓 硕士(海归)(已认证)');
  });

  it('fuzzy profession tag hides company name', () => {
    expect(
      buildFuzzyProfessionDisplayTag({
        industryTag: 'tech',
        companyTierTag: 'tier1_tech',
        roleLevelTag: 'product_director',
      }),
    ).toBe('👨‍💻 泛科技·产品总监(已认证)');
  });

  it('email-only verification uses industry + tier', () => {
    expect(
      buildFuzzyProfessionDisplayTag({
        industryTag: 'tech',
        companyTierTag: 'tier1_tech',
        roleLevelTag: 'employee',
      }),
    ).toBe('👨‍💻 泛科技·头部大厂(已认证)');
  });

  it('manufacturing uses group fuzzy label', () => {
    expect(
      buildFuzzyProfessionDisplayTag({
        industryTag: 'manufacturing',
        companyTierTag: 'known_manufacturing',
        roleLevelTag: 'solutions_expert',
      }),
    ).toBe('🏭 知名制造集团·解决方案专家(已认证)');
  });
});
