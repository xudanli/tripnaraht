import type { MatchSquareRecruitmentPost } from '@prisma/client';
import { buildTeamPuzzle } from './slot-filling.engine';
import { createEmptyRawScores, computeDimensionPercents } from '../../odyssey-intake/engine/intake-scoring.engine';
import type { MatchableProfile } from '../../odyssey-intake/engine/companion-matching.engine';
import type { CaptainPersonaSnapshot } from '../types/match-square.types';

function mockPost(overrides: Partial<MatchSquareRecruitmentPost> = {}): MatchSquareRecruitmentPost {
  const captainSnapshot: CaptainPersonaSnapshot = {
    mbtiType: 'ISFJ',
    cardTitle: '秩序维护的质感旅行者',
    interactionMode: 'steady_companion',
    interactionModeLabel: '稳定陪伴型',
    quadrant: 'SJ',
    rawScores: {
      ...createEmptyRawScores(),
      ambiguity_tolerance: -1,
      mbti_i_score: 8,
      mbti_j_score: 6,
    },
    dimensionPercents: {
      E: 30,
      I: 70,
      N: 35,
      S: 65,
      T: 45,
      F: 55,
      J: 68,
      P: 32,
    },
  };

  return {
    id: 'post-1',
    status: 'active',
    captainUserId: 'captain-1',
    captainCardTitle: '秩序维护的质感旅行者',
    captainMbtiType: 'ISFJ',
    captainInteractionMode: 'steady_companion',
    captainPersonaSnapshot: captainSnapshot,
    captainReputationStars: null,
    destination: '西北环线',
    departureLabel: '杭州出发',
    destinationLat: null,
    destinationLng: null,
    destinationPoiId: null,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-10'),
    itinerarySummary: '环线',
    budgetMinCents: null,
    budgetMaxCents: null,
    slotsNeeded: 4,
    slotsFilled: 1,
    preferenceNotes: '招募会开车的摄影师',
    tripMoodTag: 'adventure',
    travelMode: 'self_drive',
    vehicleInfo: '宝马3系',
    captainMessage: '不赶路',
    publishedAt: new Date(),
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MatchSquareRecruitmentPost;
}

describe('buildTeamPuzzle', () => {
  it('renders AI suggested deficit slots for ISFJ captain', () => {
    const puzzle = buildTeamPuzzle(mockPost(), null);
    expect(puzzle.algorithm).toBe('team_deficit_pomdp_v1');
    expect(puzzle.slots[0].roleLabel).toBe('队长');
    const openSlots = puzzle.slots.filter((s) => s.kind === 'open');
    expect(openSlots.length).toBe(4);
    expect(openSlots[0].roleLabel).toContain('建议补位');
    expect(openSlots[0].aiRationale).toBeTruthy();
    expect(openSlots.some((s) => s.deficitDimension === 'energy_balance')).toBe(true);
  });

  it('highlights soul puzzle for matching ENFP viewer', () => {
    const scores = { ...createEmptyRawScores(), mbti_e_score: 8, social_drive: 2 };
    const viewer: MatchableProfile = {
      userId: 'viewer-1',
      mbtiType: 'ENFP',
      cardTitle: '满血复活的社交气氛组',
      rawScores: scores,
      dimensionPercents: { ...computeDimensionPercents(scores), E: 75, I: 25 },
    };

    const puzzle = buildTeamPuzzle(mockPost(), viewer);
    expect(puzzle.viewerPuzzleMatch?.isSoulPiece).toBe(true);
    expect(puzzle.viewerPuzzleMatch?.headline).toContain('灵魂拼图');
    const energySlot = puzzle.slots.find((s) => s.deficitDimension === 'energy_balance');
    expect(energySlot?.highlightForViewer).toBe(true);
  });

  it('merges preference notes into later slots', () => {
    const puzzle = buildTeamPuzzle(mockPost(), null);
    expect(
      puzzle.slots.some(
        (s) => s.roleLabel.includes('摄影师') || s.aiRationale?.includes('摄影师'),
      ),
    ).toBe(true);
  });

  it('prioritizes Vibe LLM slot_definitions over default deficits', () => {
    const snapshot = mockPost().captainPersonaSnapshot as CaptainPersonaSnapshot & {
      _vibeLlm?: unknown;
    };
    snapshot._vibeLlm = {
      vibe_chips: [{ id: 'self_drive_tour', label: '🏎️ 自驾环游' }],
      teamwork_contract_model: 'Co-Creation',
      hard_gates: {},
      slot_definitions: [
        {
          slot_id: 1,
          expected_tag: 'E人/气氛组',
          reason: '平衡长途自驾的沉闷氛围',
          targetMbtiTypes: ['ENFP', 'ESFP'],
        },
      ],
      behavioral_contracts: [],
      contract_hint: null,
      parse_source: 'rules',
      parse_version: 'vibe_llm_v1',
    };

    const puzzle = buildTeamPuzzle(mockPost({ captainPersonaSnapshot: snapshot }), null);
    const openSlots = puzzle.slots.filter((s) => s.kind === 'open');
    expect(openSlots[0].slotId).toBe('vibe-slot-1');
    expect(openSlots[0].roleLabel).toContain('E人/气氛组');
    expect(openSlots[0].aiRationale).toContain('沉闷氛围');
  });

  it('marks approved member slots as filled from snapshot', () => {
    const snapshot = {
      ...(mockPost().captainPersonaSnapshot as object),
      _teamPuzzleFilledSlots: {
        version: 'team_puzzle_filled_v1',
        slots: [
          {
            slotIndex: 2,
            slotId: 'puzzle-slot-2',
            userId: 'member-1',
            occupantLabel: 'Alice',
            applicationId: 'app-1',
            roleLabel: 'E人/气氛组',
            approvedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    };

    const puzzle = buildTeamPuzzle(mockPost({ captainPersonaSnapshot: snapshot }), null);
    const slot2 = puzzle.slots.find((s) => s.slotIndex === 2);
    expect(slot2?.kind).toBe('filled');
    expect(slot2?.occupantLabel).toBe('Alice');
  });
});
