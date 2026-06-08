import type { MatchSquareRecruitmentPost } from '@prisma/client';
import { buildTeamPuzzle } from './slot-filling.engine';
import { readTeamPuzzleFilledSlots } from './team-puzzle-assignment.engine';
import {
  SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY,
  SOVEREIGN_FORCE_LOCK_VERSION,
  type SovereignForceLockDroppedSlotView,
  type SovereignForceLockPreviewView,
  type SovereignForceLockRecord,
  type SovereignForceLockVaultRecalcView,
  type SovereignForceLockCrewMemberView,
} from '../types/sovereign-force-lock.types';

export interface ForceLockApplicationRow {
  id: string;
  applicantUserId: string;
  status: string;
  applicantDisplayName: string | null;
  applicantCardTitle: string;
  targetSlotIndex: number | null;
  targetSlotLabel: string | null;
}

export interface BuildForceLockPreviewInput {
  post: Pick<
    MatchSquareRecruitmentPost,
    | 'id'
    | 'status'
    | 'captainUserId'
    | 'captainCardTitle'
    | 'slotsNeeded'
    | 'slotsFilled'
    | 'budgetMinCents'
    | 'budgetMaxCents'
    | 'captainPersonaSnapshot'
  >;
  approvedApplications: ForceLockApplicationRow[];
  pendingApplications: ForceLockApplicationRow[];
}

export function readSovereignForceLockFromSnapshot(raw: unknown): SovereignForceLockRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = (raw as Record<string, unknown>)[SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const rec = stored as SovereignForceLockRecord;
  if (rec.version !== SOVEREIGN_FORCE_LOCK_VERSION) return null;
  return rec;
}

export function isSovereignSealedPost(post: {
  status: string;
  slotsFilled: number;
  slotsNeeded: number;
  captainPersonaSnapshot: unknown;
}): boolean {
  if (post.status !== 'closed') return false;
  if (readSovereignForceLockFromSnapshot(post.captainPersonaSnapshot)) return true;
  return post.slotsFilled >= post.slotsNeeded;
}

export function computeVaultRecalc(
  post: Pick<MatchSquareRecruitmentPost, 'slotsNeeded' | 'slotsFilled' | 'budgetMinCents' | 'budgetMaxCents'>,
): SovereignForceLockVaultRecalcView {
  const previousSplitBase = 1 + post.slotsNeeded;
  const actualSplitBase = 1 + post.slotsFilled;
  const perPersonCap = post.budgetMaxCents ?? post.budgetMinCents ?? null;

  let budgetPerPersonCents: number | null = null;
  if (perPersonCap != null && actualSplitBase > 0) {
    const estimatedTotal = perPersonCap * previousSplitBase;
    budgetPerPersonCents = Math.round(estimatedTotal / actualSplitBase);
  }

  const summaryLine =
    budgetPerPersonCents != null
      ? `分摊基数 ${previousSplitBase} 人 → ${actualSplitBase} 人；人均预算约 ¥${Math.round(budgetPerPersonCents / 100).toLocaleString('zh-CN')}`
      : `分摊基数 ${previousSplitBase} 人 → ${actualSplitBase} 人`;

  return {
    previousSplitBase,
    actualSplitBase,
    budgetPerPersonCents,
    summaryLine,
  };
}

function listDroppedOpenSlots(
  post: BuildForceLockPreviewInput['post'],
): SovereignForceLockDroppedSlotView[] {
  const filled = readTeamPuzzleFilledSlots(post.captainPersonaSnapshot);
  const filledIndexes = new Set(filled?.slots.map((s) => s.slotIndex) ?? []);
  const puzzle = buildTeamPuzzle(post as MatchSquareRecruitmentPost, null);
  const dropped: SovereignForceLockDroppedSlotView[] = [];

  for (const slot of puzzle.slots) {
    if (slot.kind !== 'open' || slot.slotIndex == null) continue;
    if (filledIndexes.has(slot.slotIndex)) continue;
    dropped.push({
      slotIndex: slot.slotIndex,
      slotId: slot.slotId ?? null,
      roleLabel: slot.roleLabel,
      deficitTag: slot.deficitDimension ?? 'preference',
    });
  }

  return dropped;
}

function buildPhysicalDeficits(dropped: SovereignForceLockDroppedSlotView[]): string[] {
  return dropped.map(
    (s) => `缺少 ${s.roleLabel.replace(/^建议补位 · /, '')} · 标记为全队物理赤字`,
  );
}

function computeResilienceScore(
  slotsFilled: number,
  slotsNeeded: number,
  droppedCount: number,
): number {
  const fillRatio = slotsNeeded > 0 ? slotsFilled / slotsNeeded : 1;
  const base = Math.round(fillRatio * 100);
  const penalty = droppedCount * 12;
  return Math.max(35, Math.min(100, base - penalty));
}

function buildCurrentCrew(input: BuildForceLockPreviewInput): SovereignForceLockCrewMemberView[] {
  const crew: SovereignForceLockCrewMemberView[] = [
    {
      userId: input.post.captainUserId,
      role: 'captain',
      slotLabel: '队长',
      displayName: null,
    },
  ];

  for (const app of input.approvedApplications) {
    crew.push({
      userId: app.applicantUserId,
      role: 'member',
      slotLabel: app.targetSlotLabel ?? app.applicantCardTitle,
      displayName: app.applicantDisplayName,
      applicationId: app.id,
    });
  }

  return crew;
}

export function buildForceLockPreview(input: BuildForceLockPreviewInput): SovereignForceLockPreviewView {
  const existing = readSovereignForceLockFromSnapshot(input.post.captainPersonaSnapshot);
  if (existing) {
    return {
      postId: input.post.id,
      canForceLock: false,
      blockReason: '该招募已执行强制成团锁死',
      currentCrew: buildCurrentCrew(input),
      droppedOpenSlots: existing.droppedOpenSlots,
      physicalDeficits: existing.physicalDeficits,
      resilienceScore: existing.resilienceScore,
      vaultRecalc: existing.vaultRecalc,
      pendingApplicationsToReject: 0,
      confirmHeadline: '已锁团',
      confirmLines: [],
    };
  }

  if (input.post.status !== 'active') {
    return blockedPreview(input, '仅进行中的招募可强制成团');
  }

  if (input.post.slotsFilled < 1) {
    return blockedPreview(input, '至少需 1 名已通过队员方可强制成团');
  }

  if (input.post.slotsFilled >= input.post.slotsNeeded) {
    return blockedPreview(input, '已满员，请使用常规成团流程');
  }

  const droppedOpenSlots = listDroppedOpenSlots(input.post);
  const physicalDeficits = buildPhysicalDeficits(droppedOpenSlots);
  const vaultRecalc = computeVaultRecalc(input.post);
  const resilienceScore = computeResilienceScore(
    input.post.slotsFilled,
    input.post.slotsNeeded,
    droppedOpenSlots.length,
  );

  const confirmLines = [
    `当前阵容 ${1 + input.post.slotsFilled} 人，将裁剪 ${droppedOpenSlots.length} 个空缺拼图位`,
    ...physicalDeficits.slice(0, 2),
    vaultRecalc.summaryLine,
    input.pendingApplications.length > 0
      ? `将自动拒绝 ${input.pendingApplications.length} 条待审批申请`
      : '无待审批申请',
  ];

  return {
    postId: input.post.id,
    canForceLock: true,
    blockReason: null,
    currentCrew: buildCurrentCrew(input),
    droppedOpenSlots,
    physicalDeficits,
    resilienceScore,
    vaultRecalc,
    pendingApplicationsToReject: input.pendingApplications.length,
    confirmHeadline: '确认强制成团？',
    confirmLines,
  };
}

function blockedPreview(
  input: BuildForceLockPreviewInput,
  reason: string,
): SovereignForceLockPreviewView {
  return {
    postId: input.post.id,
    canForceLock: false,
    blockReason: reason,
    currentCrew: buildCurrentCrew(input),
    droppedOpenSlots: [],
    physicalDeficits: [],
    resilienceScore: 0,
    vaultRecalc: computeVaultRecalc(input.post),
    pendingApplicationsToReject: input.pendingApplications.length,
    confirmHeadline: '无法强制成团',
    confirmLines: [reason],
  };
}

export function buildSovereignForceLockRecord(input: {
  post: BuildForceLockPreviewInput['post'];
  preview: SovereignForceLockPreviewView;
  lockedByUserId: string;
  note: string | null;
  pendingRejected: number;
  taskRebalanceNote: string | null;
}): SovereignForceLockRecord {
  return {
    version: SOVEREIGN_FORCE_LOCK_VERSION,
    lockedAt: new Date().toISOString(),
    lockedByUserId: input.lockedByUserId,
    note: input.note,
    originalSlotsNeeded: input.post.slotsNeeded,
    effectiveSlotsNeeded: input.post.slotsFilled,
    droppedOpenSlots: input.preview.droppedOpenSlots,
    physicalDeficits: input.preview.physicalDeficits,
    resilienceScore: input.preview.resilienceScore,
    vaultRecalc: input.preview.vaultRecalc,
    pendingApplicationsRejected: input.pendingRejected,
    taskRebalanceNote: input.taskRebalanceNote,
  };
}

export function attachSovereignForceLockSnapshot<T extends object>(
  snapshot: T,
  record: SovereignForceLockRecord,
): T & Record<typeof SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY, SovereignForceLockRecord> {
  return { ...snapshot, [SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY]: record };
}

/** 强制缩编后追加公摊物资任务说明 */
export function buildTaskRebalanceNote(input: {
  droppedSlotCount: number;
  assigneeLabel: string | null;
  sharedGearLabels: string[];
}): string | null {
  if (input.droppedSlotCount === 0 && input.sharedGearLabels.length === 0) return null;
  const gear =
    input.sharedGearLabels.length > 0
      ? `公摊物资（${input.sharedGearLabels.slice(0, 2).join('、')}）`
      : '公摊物资';
  const assignee = input.assigneeLabel ?? '体能余量最高队员';
  return `负荷重载：${gear} 已重派至 ${assignee}`;
}
