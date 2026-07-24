import { buildOnboardingStatus, buildProfileCardView, enrichProfileForCard } from './util/card-ui-contract.util';
import { OdysseyIntakeService } from './odyssey-intake.service';
import type { OdysseyIntakeProfile } from './types/odyssey-intake.types';

describe('card-ui-contract.util', () => {
  it('builds onboarding steps for new user (v2)', () => {
    const status = buildOnboardingStatus(null, null);
    expect(status.quizComplete).toBe(false);
    expect(status.mbtiSelected).toBe(false);
    expect(status.nextStep).toBe('mbti_select');
    expect(status.canMatch).toBe(false);
    expect(status.intakeVersion).toBe(2);
  });

  it('requires credentials then premium stress test', () => {
    const draft = {
      version: 2,
      mbtiType: 'INTJ',
      mbtiSelectedAt: '2026-01-01',
      completedAt: '',
    } as OdysseyIntakeProfile;
    let status = buildOnboardingStatus(draft, null);
    expect(status.mbtiSelected).toBe(true);
    expect(status.nextStep).toBe('credentials');

    status = buildOnboardingStatus(draft, null, {
      education: { verifiedAt: '2026-01-01' } as any,
    });
    expect(status.credentialsVerified).toBe(true);
    expect(status.nextStep).toBe('premium_stress_test');
  });

  it('routes v1 complete users to premium upgrade when not on v2', () => {
    const v1Profile = {
      version: 1,
      completedAt: '2026-01-01',
      mbtiType: 'INTJ',
    } as OdysseyIntakeProfile;
    const status = buildOnboardingStatus(v1Profile, null);
    expect(status.intakeVersion).toBe(1);
    expect(status.quizComplete).toBe(true);
    expect(status.premiumStressComplete).toBe(false);
    expect(status.nextStep).toBe('credentials');
  });

  it('requires trust before match after premium complete', () => {
    const profile = {
      version: 2,
      completedAt: '2026-01-01',
      mbtiType: 'INTJ',
      mbtiSelectedAt: '2026-01-01',
      mbtiSource: 'self_selected',
      premiumStressAnswers: {
        resource_scarcity_replan: 'A',
        convoy_division_collaboration: 'A',
        premium_upcharge_decision: 'A',
      },
    } as OdysseyIntakeProfile;
    const status = buildOnboardingStatus(profile, null, {
      profession: { verifiedAt: '2026-01-01' } as any,
    });
    expect(status.quizComplete).toBe(true);
    expect(status.trustVerified).toBe(false);
    expect(status.nextStep).toBe('trust_verify');
    expect(status.canMatch).toBe(false);
  });

  it('builds profile card view with shimmer when refresh pending', () => {
    const profile = {
      completedAt: '2026-01-01',
      profileRefreshPending: true,
      profileRefreshMessage: '雷达图已更新',
      card: { title: 'test', theme: { quadrant: 'NT' } },
    } as OdysseyIntakeProfile;

    const view = buildProfileCardView({ profile, tripMeta: null, trust: null });
    expect(view.ui.placement).toBe('profile_header_third');
    expect(view.ui.showShimmerRefresh).toBe(true);
    expect(view.ui.cta.label).toBe('调整本次出行状态');
    expect(view.ui.tripIntentTagOptions.length).toBeGreaterThan(0);
  });
});

describe('OdysseyIntakeService (unit)', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  const mockPrisma = {
    userTravelProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  let service: OdysseyIntakeService;
  let storedExt: Record<string, unknown>;

  const mockGateway = {
    verifyXuexinOnlineCode: jest
      .fn()
      .mockResolvedValue({ degreeLevel: 'master', tierTag: '985_211' }),
    sendWorkEmailVerificationCode: jest
      .fn()
      .mockResolvedValue({ expiresInSeconds: 600, devCode: '123456' }),
    verifyWorkEmailCode: jest.fn().mockResolvedValue({
      channel: 'work_email',
      industryTag: 'tech',
      companyTierTag: 'tier1_tech',
      roleLevelTag: 'employee',
    }),
    verifyProfessionOAuth: jest.fn().mockResolvedValue({
      channel: 'oauth_maimai',
      industryTag: 'tech',
      companyTierTag: 'tier1_tech',
      roleLevelTag: 'product_director',
    }),
    uploadProfessionBadgeImage: jest.fn().mockResolvedValue({
      imageToken: 'badge-token',
      expiresInSeconds: 900,
    }),
    verifyProfessionBadgeOcr: jest.fn().mockResolvedValue({
      channel: 'badge_ocr',
      industryTag: 'manufacturing',
      companyTierTag: 'known_manufacturing',
      roleLevelTag: 'solutions_expert',
    }),
    getGatewayStatus: jest.fn().mockReturnValue({
      mode: 'hybrid',
      channels: [],
      redisOtpStore: false,
      localBadgeOcrFallback: false,
    }),
  };

  beforeEach(() => {
    storedExt = {};
    mockPrisma.userTravelProfile.findUnique.mockImplementation(async () => ({
      extendedProfile: Object.keys(storedExt).length ? storedExt : null,
    }));
    mockPrisma.userTravelProfile.upsert.mockImplementation(async ({ create, update }: any) => {
      const next = update?.extendedProfile ?? create?.extendedProfile;
      if (next && typeof next === 'object') {
        storedExt = { ...storedExt, ...(next as object) };
      }
      return {};
    });

    service = new OdysseyIntakeService(mockPrisma as any, mockGateway as any);
  });

  const premiumAnswers = [
    { scenarioId: 'resource_scarcity_replan' as const, optionId: 'A' as const },
    { scenarioId: 'convoy_division_collaboration' as const, optionId: 'A' as const },
    { scenarioId: 'premium_upcharge_decision' as const, optionId: 'A' as const },
  ];

  it('selectMbti persists draft profile', async () => {
    const profile = await service.selectMbti(userId, { mbtiType: 'INTJ' });
    expect(profile.mbtiType).toBe('INTJ');
    expect(profile.mbtiSource).toBe('self_selected');
    expect(profile.completedAt).toBe('');
    expect(profile.version).toBe(2);
  });

  it('submitPremiumIntake persists full v2 profile', async () => {
    await service.selectMbti(userId, { mbtiType: 'INTJ' });
    const profile = await service.submitPremiumIntake(userId, { answers: premiumAnswers });
    expect(profile.mbtiType).toBe('INTJ');
    expect(profile.travelCollaborationGene).toBe('full_managed_leader');
    expect(profile.card.title).toBeTruthy();
    expect(profile.rawScores.control_desire).toBe(2);

    const loaded = await service.getProfile(userId);
    expect(loaded?.premiumStressAnswers?.convoy_division_collaboration).toBe('A');
  });

  it('accepts legacy premium scenario alias resource_crunch', async () => {
    await service.selectMbti(userId, { mbtiType: 'INTJ' });
    const profile = await service.submitPremiumIntake(userId, {
      answers: [
        { scenarioId: 'resource_crunch' as any, optionId: 'B' },
        { scenarioId: 'convoy_division_collaboration', optionId: 'A' },
        { scenarioId: 'premium_upcharge_decision', optionId: 'A' },
      ],
    });
    expect(profile.premiumStressAnswers?.resource_scarcity_replan).toBe('B');
  });

  it('upgrades v1 complete profile to v2 on premium submit', async () => {
    storedExt = {
      odyssey_intake: {
        version: 1,
        completedAt: '2025-01-01T00:00:00.000Z',
        mbtiType: 'ENFP',
        answers: { energy_pace: 'A' },
        rawScores: {},
        dimensionPercents: {},
        card: { title: '旧版名片', mbtiType: 'ENFP', subtitle: '', theme: {}, radar: {} },
      },
    };
    mockPrisma.userTravelProfile.findUnique.mockImplementation(async () => ({
      extendedProfile: storedExt,
    }));

    const profile = await service.submitPremiumIntake(userId, { answers: premiumAnswers });
    expect(profile.version).toBe(2);
    expect(profile.mbtiSource).toBe('self_selected');
    expect(profile.travelCollaborationGene).toBeTruthy();
    expect(profile.premiumStressAnswers?.premium_upcharge_decision).toBe('A');
  });

  it('updateTripMeta validates date order', async () => {
    await expect(
      service.updateTripMeta(userId, {
        destination: 'Iceland',
        startDate: '2026-07-10',
        endDate: '2026-07-01',
      }),
    ).rejects.toThrow('endDate');
  });

  it('verifyTrust enables canMatch after premium intake', async () => {
    await service.submitPremiumIntake(userId, { mbtiType: 'INTJ', answers: premiumAnswers });
    let status = await service.getOnboardingStatus(userId);
    expect(status.canMatch).toBe(false);

    await service.verifyTrust(userId, { provider: 'zhima_credit', authToken: 'mock-token' });
    status = await service.getOnboardingStatus(userId);
    expect(status.canMatch).toBe(true);
    expect(status.nextStep).toBe('match');
  });

  it('matchCompanions rejects without trust verification', async () => {
    await service.submitPremiumIntake(userId, { mbtiType: 'INTJ', answers: premiumAnswers });
    await expect(service.matchCompanions(userId, {})).rejects.toThrow('安全授权');
  });

  it('getPremiumStressQuestions includes wallpaper URLs', () => {
    const questions = service.getPremiumStressQuestions();
    expect(questions).toHaveLength(3);
    expect(questions[0].wallpaper.url).toContain('http');
  });

  it('getMbtiTypeCards returns 16 types', () => {
    const cards = service.getMbtiTypeCards();
    expect(cards.types).toHaveLength(16);
    expect(cards.hint).toContain('一键点亮');
  });

  it('rejects deprecated v1 submitIntake', async () => {
    await expect(
      service.submitIntake(userId, [{ scenarioId: 'energy_pace', optionId: 'A' } as any]),
    ).rejects.toThrow('v1 五题测评已下线');
  });

  it('updateTripIntent persists tripIntentTag and returns card view', async () => {
    await service.submitPremiumIntake(userId, { mbtiType: 'INTJ', answers: premiumAnswers });

    const cardView = await service.updateTripIntent(userId, { tripIntentTag: 'budget_mode' });
    expect(cardView.profile?.tripIntentTags).toEqual(['budget_mode']);
    expect(cardView.profile?.tripIntentTag).toBe('budget_mode');
    expect(cardView.profile?.trip_intent_tag).toBe('budget_mode');
    expect(cardView.profile?.trip_intent_tags).toEqual(['budget_mode']);

    const reloaded = await service.getProfileCardView(userId);
    expect(reloaded.profile?.tripIntentTags).toEqual(['budget_mode']);
    expect(reloaded.profile?.tripIntentTag).toBe('budget_mode');
    expect(reloaded.profile?.card.title).toBeTruthy();
    expect(reloaded.profile?.mbtiType).toBe('INTJ');
  });

  it('enrichProfileForCard exposes snake_case aliases', () => {
    const enriched = enrichProfileForCard({
      completedAt: '2026-01-01',
      tripIntentTags: ['open_to_match'],
    } as any);
    expect(enriched?.trip_intent_tags).toEqual(['open_to_match']);
    expect(enriched?.trip_intent_tag).toBe('open_to_match');
  });

  it('verifyEducationCredential uses gateway not user-declared tier', async () => {
    const bundle = await service.verifyEducationCredential(userId, {
      verificationCode: '985-demo',
    });
    expect(mockGateway.verifyXuexinOnlineCode).toHaveBeenCalledWith('985-demo');
    expect(bundle.education?.displayTag).toBe('🎓 985/211(已认证)');
    expect(bundle.education?.verificationChannel).toBe('xuexin_online_code');
  });

  it('verifyProfessionEmailCredential persists fuzzy tag', async () => {
    const bundle = await service.verifyProfessionEmailCredential(userId, {
      workEmail: 'danny@tencent.com',
      verificationCode: '123456',
    });
    expect(bundle.profession?.displayTags[0]).toContain('泛科技');
    expect(bundle.profession?.displayTags[0]).toContain('已认证');
  });

  it('rejects deprecated self-declared profession verify', async () => {
    await expect(
      service.verifyProfessionCredential(userId, {
        industryTag: 'tech',
        roleDisplayTag: '腾讯总监',
        authToken: 'x',
      }),
    ).rejects.toThrow('PRD 3.1.3');
  });
});
