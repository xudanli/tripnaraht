import type { MatchSquareRecruitmentApplication, MatchSquareRecruitmentPost } from '@prisma/client';
import type { TeamPuzzleSlotView } from '../types/match-square.types';
import {
  buildPuzzleSlotId,
  buildVibePuzzleSlotId,
  TEAM_PUZZLE_FILLED_SNAPSHOT_KEY,
  TEAM_PUZZLE_FILLED_VERSION,
  type TeamPuzzleFilledSlotRecord,
  type TeamPuzzleFilledSlotsSnapshot,
} from '../types/team-puzzle-assignment.types';
import { readVibePayloadFromSnapshot } from './vibe-llm-parse.engine';

export interface ResolveTargetSlotInput {
  targetSlotIndex?: number | null;
  targetSlotId?: string | null;
  memberSlotCount: number;
  vibeSlotIds?: number[];
}

export function resolveApplicationTargetSlot(input: ResolveTargetSlotInput): {
  slotIndex: number;
  slotId: string;
} | null {
  if (input.targetSlotIndex != null) {
    const slotIndex = input.targetSlotIndex;
    if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > input.memberSlotCount) {
      return null;
    }
    return { slotIndex, slotId: buildPuzzleSlotId(slotIndex) };
  }

  const rawId = input.targetSlotId?.trim();
  if (!rawId) return null;

  const puzzleMatch = /^puzzle-slot-(\d+)$/.exec(rawId);
  if (puzzleMatch) {
    const slotIndex = Number(puzzleMatch[1]);
    if (slotIndex < 1 || slotIndex > input.memberSlotCount) return null;
    return { slotIndex, slotId: rawId };
  }

  const vibeMatch = /^vibe-slot-(\d+)$/.exec(rawId);
  if (vibeMatch) {
    const vibeSlotId = Number(vibeMatch[1]);
    const vibeIds = input.vibeSlotIds ?? [];
    const position = vibeIds.indexOf(vibeSlotId);
    if (position < 0 || position >= input.memberSlotCount) return null;
    return { slotIndex: position + 1, slotId: rawId };
  }

  return null;
}

export function readTeamPuzzleFilledSlots(raw: unknown): TeamPuzzleFilledSlotsSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = (raw as Record<string, unknown>)[TEAM_PUZZLE_FILLED_SNAPSHOT_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const block = stored as TeamPuzzleFilledSlotsSnapshot;
  if (block.version !== TEAM_PUZZLE_FILLED_VERSION || !Array.isArray(block.slots)) return null;
  return block;
}

export function listOccupiedSlotIndexes(
  filled: TeamPuzzleFilledSlotsSnapshot | null,
  pendingApplications: Array<{ targetSlotIndex: number | null }>,
): Set<number> {
  const occupied = new Set<number>();
  for (const slot of filled?.slots ?? []) {
    occupied.add(slot.slotIndex);
  }
  for (const app of pendingApplications) {
    if (app.targetSlotIndex != null) {
      occupied.add(app.targetSlotIndex);
    }
  }
  return occupied;
}

export function findFirstOpenMemberSlotIndex(
  memberSlotCount: number,
  occupied: Set<number>,
): number | null {
  for (let i = 1; i <= memberSlotCount; i++) {
    if (!occupied.has(i)) return i;
  }
  return null;
}

export function appendFilledSlotToSnapshot<T extends object>(
  snapshot: T,
  record: TeamPuzzleFilledSlotRecord,
): T & Record<typeof TEAM_PUZZLE_FILLED_SNAPSHOT_KEY, TeamPuzzleFilledSlotsSnapshot> {
  const existing = readTeamPuzzleFilledSlots(snapshot);
  const slots = [...(existing?.slots ?? [])];
  const idx = slots.findIndex((s) => s.slotIndex === record.slotIndex);
  if (idx >= 0) {
    slots[idx] = record;
  } else {
    slots.push(record);
  }
  slots.sort((a, b) => a.slotIndex - b.slotIndex);

  return {
    ...snapshot,
    [TEAM_PUZZLE_FILLED_SNAPSHOT_KEY]: {
      version: TEAM_PUZZLE_FILLED_VERSION,
      slots,
    },
  };
}

export function mergeFilledSlotsIntoTeamPuzzle(
  slots: TeamPuzzleSlotView[],
  filled: TeamPuzzleFilledSlotsSnapshot | null,
): TeamPuzzleSlotView[] {
  if (!filled?.slots.length) return slots;

  const byIndex = new Map(filled.slots.map((s) => [s.slotIndex, s]));

  return slots.map((slot) => {
    if (slot.kind !== 'open' || slot.slotIndex == null) return slot;
    const record = byIndex.get(slot.slotIndex);
    if (!record) return slot;

    return {
      ...slot,
      kind: 'filled',
      slotId: record.slotId,
      occupantUserId: record.userId,
      occupantLabel: record.occupantLabel,
      roleLabel: record.roleLabel || slot.roleLabel,
      highlightForViewer: false,
      viewerMatchScore: undefined,
    };
  });
}

export function extractVibeSlotIdsFromPost(post: MatchSquareRecruitmentPost): number[] {
  const raw = post.captainPersonaSnapshot;
  if (!raw || typeof raw !== 'object') return [];
  const payload = readVibePayloadFromSnapshot(raw);
  return payload?.slot_definitions.map((s) => s.slot_id) ?? [];
}

export function buildFilledSlotRecord(input: {
  slotIndex: number;
  slotId: string;
  application: Pick<
    MatchSquareRecruitmentApplication,
    'id' | 'applicantUserId' | 'applicantCardTitle' | 'applicantDisplayName'
  >;
  at?: string;
}): TeamPuzzleFilledSlotRecord {
  const occupantLabel =
    input.application.applicantDisplayName?.trim() ||
    input.application.applicantCardTitle;
  return {
    slotIndex: input.slotIndex,
    slotId: input.slotId,
    userId: input.application.applicantUserId,
    occupantLabel,
    applicationId: input.application.id,
    roleLabel: input.application.applicantCardTitle,
    approvedAt: input.at ?? new Date().toISOString(),
  };
}

export function resolveRoleLabelForSlot(
  slots: TeamPuzzleSlotView[],
  slotIndex: number,
): string {
  return slots.find((s) => s.slotIndex === slotIndex)?.roleLabel ?? `旅伴拼图位 ${slotIndex}`;
}

export { buildVibePuzzleSlotId, buildPuzzleSlotId };
