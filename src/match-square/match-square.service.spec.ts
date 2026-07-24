import { ForbiddenException } from '@nestjs/common';
import { buildMatchSquareAccess } from './util/access-gate.util';
import { deriveInteractionMode } from './config/interaction-modes.config';
import { computeCompatibilityPercent } from './util/post-card-view.util';
import { MatchSquareService } from './match-square.service';
import { createEmptyRawScores, computeDimensionPercents } from '../odyssey-intake/engine/intake-scoring.engine';
import type { OdysseyIntakeProfile } from '../odyssey-intake/types/odyssey-intake.types';

describe('match-square access gate', () => {
  it('allows browse without quiz, blocks post/apply', () => {
    expect(buildMatchSquareAccess(false)).toEqual({
      canBrowse: true,
      canPost: false,
      canApply: false,
      quizComplete: false,
    });
  });

  it('unlocks post/apply after quiz', () => {
    expect(buildMatchSquareAccess(true)).toEqual({
      canBrowse: true,
      canPost: true,
      canApply: true,
      quizComplete: true,
    });
  });
});

describe('deriveInteractionMode', () => {
  it('prefers deep learning for high aesthetic scores', () => {
    const scores = { ...createEmptyRawScores(), aesthetic_preference: 2, compromise_index: 1 };
    const percents = computeDimensionPercents(scores);
    expect(deriveInteractionMode(scores, percents).id).toBe('deep_learning');
  });
});

describe('MatchSquareService (unit)', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const postId = '660e8400-e29b-41d4-a716-446655440001';

  const mockProfile: OdysseyIntakeProfile = {
    version: 1,
    completedAt: '2026-06-01T00:00:00.000Z',
    answers: {},
    rawScores: createEmptyRawScores(),
    mbtiType: 'INTJ',
    dimensionPercents: computeDimensionPercents(createEmptyRawScores()),
    card: {
      mbtiType: 'INTJ',
      title: '规划型探索者',
      subtitle: 'test',
      theme: { quadrant: 'NT', gradientFrom: '#000', gradientTo: '#111' },
      radar: {},
    },
  };

  const mockPrisma = {
    matchSquareRecruitmentPost: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    matchSquareRecruitmentApplication: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userTravelProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  };

  const mockOdyssey = {
    getProfile: jest.fn(),
    getTripMeta: jest.fn(),
  };

  const mockReputation = {
    getAverageStars: jest.fn().mockResolvedValue(null),
    getSafetyWarning: jest.fn().mockResolvedValue(null),
    getUserReputation: jest.fn().mockResolvedValue({
      internalRiskLevel: 'none',
      averageStars: null,
      safetyWarning: null,
    }),
  };

  const mockVibeLlm = {
    parseFreeText: jest.fn().mockResolvedValue({
      payload: {
        vibe_chips: [],
        teamwork_contract_model: 'Co-Creation',
        hard_gates: {},
        slot_definitions: [],
        behavioral_contracts: [],
        contract_hint: null,
        parse_source: 'rules',
        parse_version: 'vibe_llm_v1',
      },
      suggestedPlanningStyle: 'co_planning',
      suggestedPlanningStyleLabel: '一起策划',
      teamworkContractModelLabel: '一起策划',
      suggestedItinerarySummary: '深度游',
      suggestedCaptainMessage: '希望搭子对人文历史有兴趣',
      suggestedFields: {
        destination: null,
        destinationRegionId: null,
        destinationRegionLabel: null,
        destinationSubScopeId: null,
        destinationSubScopeLabel: null,
        departureLabel: null,
        budgetMinCents: null,
        budgetMaxCents: null,
        travelMode: null,
        tripMoodTag: null,
        preferenceNotes: null,
        recruitmentScriptId: null,
        recruitmentSceneCategory: null,
      },
      realtime_ready: false,
      trekkingOrchestration: null,
      routeTemplateMatch: null,
    }),
    parseRecruitmentDraft: jest.fn(),
    resolveCreateVibeParse: jest.fn().mockResolvedValue(null),
  };

  const mockTrekkingSpawn = {
    previewSpawnFromPost: jest.fn(),
    spawnTripFromRecruitmentPost: jest.fn(),
  };

  const mockTripInstantiation = {
    previewInstantiationFromPost: jest.fn(),
    instantiateTripFromRecruitmentPost: jest.fn(),
    tryAutoInstantiateOnSeal: jest.fn(),
  };

  let service: MatchSquareService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOdyssey.getProfile.mockResolvedValue(mockProfile);
    mockOdyssey.getTripMeta.mockResolvedValue(null);
    service = new MatchSquareService(
      mockPrisma as any,
      mockOdyssey as any,
      mockReputation as any,
      mockVibeLlm as any,
      mockTrekkingSpawn as any,
      mockTripInstantiation as any,
    );
  });

  it('blocks create when quiz incomplete', async () => {
    mockOdyssey.getProfile.mockResolvedValue(null);
    await expect(
      service.createPost(userId, {
        destination: '西北',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        itinerarySummary: '深度游',
        slotsNeeded: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates post with captain persona snapshot', async () => {
    const futureStart = '2099-07-01';
    const futureEnd = '2099-07-10';

    mockPrisma.matchSquareRecruitmentPost.create.mockImplementation(async ({ data }: any) => ({
      id: postId,
      ...data,
      slotsFilled: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    }));

    const result = await service.createPost(userId, {
      destination: '西北环线',
      departureLabel: '杭州出发',
      startDate: futureStart,
      endDate: futureEnd,
      itinerarySummary: '不赶路，深度看窟',
      slotsNeeded: 1,
      planningStyle: 'co_planning',
      captainMessage: '希望搭子对人文历史有兴趣',
    });

    expect(mockPrisma.matchSquareRecruitmentPost.create).toHaveBeenCalled();
    expect(result.post.captainCardTitle).toBe('规划型探索者');
    expect(result.id).toBe(postId);
    expect(result.post.id).toBe(postId);
    expect(result.post.destination).toBe('西北环线');
    expect(result.post.isCaptain).toBe(true);
    expect(result.post.vibeParse).toBeNull();
  });

  it('persists client vibeParse snapshot on create', async () => {
    const futureStart = '2099-08-01';
    const futureEnd = '2099-08-10';
    const clientParse = {
      payload: {
        vibe_chips: [{ id: 'extreme_adventure', label: '🪂 极限 Adrenaline' }],
        teamwork_contract_model: 'Full-Service',
        hard_gates: { security_level: 'High' },
        slot_definitions: [{ slot_id: 1, expected_tag: 'E人', reason: 'AI: test' }],
        behavioral_contracts: [{ chipId: 'extreme_adventure', title: '极限冒险风险契约', clauses: ['a'] }],
        contract_hint: 'hint',
        parse_source: 'rules',
        parse_version: 'vibe_llm_v2',
        source_text: '打算去新疆直升机滑雪',
      },
      suggestedPlanningStyle: 'full_managed',
      suggestedItinerarySummary: '新疆极限行程',
      suggestedCaptainMessage: '希望金融圈白领',
      suggestedFields: {
        destination: '新疆',
        destinationRegionId: 'domestic_northwest',
        destinationSubScopeId: 'xinjiang',
        destinationRegionLabel: '国内 · 西北',
        destinationSubScopeLabel: '新疆',
        departureLabel: null,
        budgetMinCents: 3000000,
        budgetMaxCents: null,
        travelMode: null,
        tripMoodTag: 'adventure',
        preferenceNotes: null,
        recruitmentScriptId: null,
        recruitmentSceneCategory: null,
      },
      teamworkContractModelLabel: '全托管',
      suggestedPlanningStyleLabel: '全托管',
      realtime_ready: true,
    };

    mockVibeLlm.resolveCreateVibeParse.mockResolvedValue(clientParse);

    mockPrisma.matchSquareRecruitmentPost.create.mockImplementation(async ({ data }: any) => ({
      id: postId,
      ...data,
      slotsFilled: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    }));

    const result = await service.createPost(userId, {
      destination: '新疆',
      startDate: futureStart,
      endDate: futureEnd,
      itinerarySummary: '新疆极限行程',
      slotsNeeded: 1,
      planningStyle: 'full_managed',
      vibeFreeText: '打算去新疆直升机滑雪',
      vibeParse: clientParse as unknown as Record<string, unknown>,
    });

    const createArg = mockPrisma.matchSquareRecruitmentPost.create.mock.calls[0][0].data;
    expect(createArg.captainPersonaSnapshot._vibeParse).toBeDefined();
    expect(createArg.captainPersonaSnapshot._vibeParse.payload.vibe_chips[0].label).toContain('极限');
    expect(result.post.vibeParse?.payload.vibe_chips[0].label).toContain('极限');
    expect(result.post.vibeParse?.suggestedFields.destinationRegionId).toBe('domestic_northwest');
  });

  it('computes compatibility percent for logged-in viewer', () => {
    const viewer = {
      userId,
      mbtiType: 'ENFP',
      cardTitle: 'viewer',
      rawScores: createEmptyRawScores(),
      dimensionPercents: computeDimensionPercents(createEmptyRawScores()),
    };
    const snapshot = {
      mbtiType: 'INTJ',
      cardTitle: 'captain',
      interactionMode: 'deep_learning',
      interactionModeLabel: '深度共学型',
      quadrant: 'NT' as const,
      rawScores: createEmptyRawScores(),
      dimensionPercents: computeDimensionPercents(createEmptyRawScores()),
    };

    const percent = computeCompatibilityPercent(viewer, snapshot);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThanOrEqual(99);
  });

  it('returns apply preview with conflict prompt for J vs P', async () => {
    const captainPost = {
      id: postId,
      captainUserId: 'other-user',
      status: 'active',
      slotsNeeded: 2,
      slotsFilled: 0,
      captainPersonaSnapshot: {
        mbtiType: 'INTJ',
        cardTitle: '队长',
        interactionMode: 'deep_learning',
        interactionModeLabel: '深度共学型',
        quadrant: 'NT',
        rawScores: { ...createEmptyRawScores(), mbti_j_score: 10, mbti_p_score: 0 },
        dimensionPercents: computeDimensionPercents({
          ...createEmptyRawScores(),
          mbti_j_score: 10,
          mbti_p_score: 0,
        }),
      },
    };

    mockPrisma.matchSquareRecruitmentPost.findUnique.mockResolvedValue(captainPost);
    mockPrisma.matchSquareRecruitmentApplication.findFirst.mockResolvedValue(null);

    const applicantProfile = {
      ...mockProfile,
      mbtiType: 'INFP',
      rawScores: { ...createEmptyRawScores(), mbti_j_score: 0, mbti_p_score: 10 },
      dimensionPercents: computeDimensionPercents({
        ...createEmptyRawScores(),
        mbti_j_score: 0,
        mbti_p_score: 10,
      }),
    };
    mockOdyssey.getProfile.mockResolvedValue(applicantProfile);

    const preview = await service.getApplyPreview(userId, postId);
    expect(preview.canApply).toBe(true);
    expect(preview.conflictPrompt?.dimension).toBe('planning_hardness');
  });

  it('returns public credentials view for target user', async () => {
    const targetUserId = '770e8400-e29b-41d4-a716-446655440002';
    mockPrisma.userTravelProfile.findUnique.mockResolvedValue({
      extendedProfile: {
        odyssey_trust: {
          verified: true,
          provider: 'zhima_credit',
          creditScore: 820,
          creditScoreLabel: '极佳',
          creditScoreTier: 'excellent',
        },
        verified_credentials: {
          education: {
            verified: true,
            degreeLevel: 'master',
            tierTag: '985_211',
            displayTag: '🎓 硕士 · 985/211',
            verifiedAt: '2026-06-01T00:00:00.000Z',
          },
        },
      },
    });
    mockOdyssey.getProfile.mockImplementation(async (id: string) =>
      id === targetUserId
        ? { ...mockProfile, mbtiType: 'INTJ', card: { ...mockProfile.card, title: '规划型探索者' } }
        : mockProfile,
    );

    const result = await service.getUserCredentials(userId, targetUserId);
    expect(result.userId).toBe(targetUserId);
    expect(result.cardTitle).toBe('规划型探索者');
    expect(result.verifiedCredentials.dossier.sesameCredit?.score).toBe(820);
    expect(result.verifiedCredentials.dossier.education?.displayTag).toContain('985/211');
  });

  it('blocks credentials when viewer quiz incomplete', async () => {
    mockOdyssey.getProfile.mockResolvedValue(null);
    await expect(
      service.getUserCredentials(userId, '770e8400-e29b-41d4-a716-446655440002'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
