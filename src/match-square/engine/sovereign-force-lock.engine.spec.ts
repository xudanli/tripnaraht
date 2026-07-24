import {
  attachSovereignForceLockSnapshot,
  buildForceLockPreview,
  buildSovereignForceLockRecord,
  computeVaultRecalc,
  isSovereignSealedPost,
  readSovereignForceLockFromSnapshot,
} from './sovereign-force-lock.engine';
import { SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY } from '../types/sovereign-force-lock.types';
import { createEmptyRawScores } from '../../odyssey-intake/engine/intake-scoring.engine';
import type { CaptainPersonaSnapshot } from '../types/match-square.types';

describe('sovereign-force-lock.engine', () => {
  const captainSnapshot: CaptainPersonaSnapshot = {
    mbtiType: 'ISFJ',
    cardTitle: '秩序维护的质感旅行者',
    interactionMode: 'steady_companion',
    interactionModeLabel: '稳定陪伴型',
    quadrant: 'SJ',
    rawScores: {
      ...createEmptyRawScores(),
      collaborative_trait: 1,
      ambiguity_tolerance: -1,
    },
    dimensionPercents: { E: 30, I: 70, N: 35, S: 65, T: 45, F: 55, J: 68, P: 32 },
  };

  const basePost = {
    id: 'post-1',
    status: 'active' as const,
    captainUserId: 'captain-1',
    captainCardTitle: '队长',
    slotsNeeded: 4,
    slotsFilled: +2,
    budgetMinCents: 500_000,
    budgetMaxCents: 500_000,
    captainPersonaSnapshot: captainSnapshot,
  };

  const approved = [
    {
      id: 'app-1',
      applicantUserId: 'm-1',
      status: 'approved',
      applicantDisplayName: '阿音',
      applicantCardTitle: 'ESFP 乐手',
      targetSlotIndex: 0,
      targetSlotLabel: '建议补位 · 摄影',
    },
    {
      id: 'app-2',
      applicantUserId: 'm-2',
      status: 'approved',
      applicantDisplayName: 'Bob',
      applicantCardTitle: 'ISTJ 后勤',
      targetSlotIndex: 1,
      targetSlotLabel: '建议补位 · 后勤',
    },
  ];

  it('allows force lock preview when partially filled', () => {
    const preview = buildForceLockPreview({
      post: basePost,
      approvedApplications: approved,
      pendingApplications: [{ id: 'p-1', applicantUserId: 'x', status: 'pending', applicantDisplayName: null, applicantCardTitle: '待审', targetSlotIndex: null, targetSlotLabel: null }],
    });

    expect(preview.canForceLock).toBe(true);
    expect(preview.currentCrew).toHaveLength(3);
    expect(preview.pendingApplicationsToReject).toBe(1);
    expect(preview.vaultRecalc.previousSplitBase).toBe(5);
    expect(preview.vaultRecalc.actualSplitBase).toBe(3);
    expect(preview.resilienceScore).toBeGreaterThan(0);
  });

  it('blocks when no approved members', () => {
    const preview = buildForceLockPreview({
      post: { ...basePost, slotsFilled: 0 },
      approvedApplications: [],
      pendingApplications: [],
    });
    expect(preview.canForceLock).toBe(false);
    expect(preview.blockReason).toContain('至少需 1 名');
  });

  it('recalculates vault split base', () => {
    const recalc = computeVaultRecalc({
      slotsNeeded: 4,
      slotsFilled: 2,
      budgetMinCents: null,
      budgetMaxCents: 400_000,
    });
    expect(recalc.budgetPerPersonCents).toBe(Math.round((400_000 * 5) / 3));
    expect(recalc.summaryLine).toContain('5 人 → 3 人');
  });

  it('marks sovereign sealed post for instantiation', () => {
    const preview = buildForceLockPreview({
      post: basePost,
      approvedApplications: approved,
      pendingApplications: [],
    });
    const record = buildSovereignForceLockRecord({
      post: basePost,
      preview,
      lockedByUserId: 'captain-1',
      note: null,
      pendingRejected: 0,
      taskRebalanceNote: '负荷重载',
    });
    const snapshot = attachSovereignForceLockSnapshot({}, record);

    expect(readSovereignForceLockFromSnapshot(snapshot)).not.toBeNull();
    expect(
      isSovereignSealedPost({
        status: 'closed',
        slotsFilled: 2,
        slotsNeeded: 2,
        captainPersonaSnapshot: snapshot,
      }),
    ).toBe(true);
    expect((snapshot as Record<string, unknown>)[SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY]).toBeDefined();
  });
});
