import {
  buildEducationDisplayTag,
  buildVerifiedCredentialsView,
  normalizeEducationCredential,
  normalizeProfessionCredential,
} from './verified-credentials.util';

describe('verified credentials util', () => {
  it('builds education display tag with verified suffix', () => {
    expect(buildEducationDisplayTag('master', 'overseas')).toBe('🎓 硕士(海归)(已认证)');
  });

  it('builds headline with fuzzy profession and education badges', () => {
    const view = buildVerifiedCredentialsView({
      trust: {
        verified: true,
        provider: 'zhima_credit',
        creditScore: 800,
        creditScoreLabel: '极佳',
        displayName: 'Danny',
      },
      credentials: {
        education: normalizeEducationCredential({ degreeLevel: 'master', tierTag: 'overseas' }),
        profession: normalizeProfessionCredential({
          channel: 'oauth_maimai',
          industryTag: 'tech',
          companyTierTag: 'tier1_tech',
          roleLevelTag: 'product_director',
        }),
      },
      teamworkStyleCapsule: '🛡️ 组队风格：一起策划',
    });

    expect(view.headline.identityHeadline).toContain('Danny');
    expect(view.headline.identityHeadline).toContain('泛科技·产品总监(已认证)');
    expect(view.headline.trustAssetLine).toContain('芝麻信用 800');
    expect(view.dossier.education?.badge.renderHint).toBe('vector_component_watermark');
  });
});
