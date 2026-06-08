/** 车队拼图槽位绑定 — 申请 targetSlot + 审批后落库 */

export const TEAM_PUZZLE_FILLED_SNAPSHOT_KEY = '_teamPuzzleFilledSlots' as const;
export const TEAM_PUZZLE_FILLED_VERSION = 'team_puzzle_filled_v1' as const;

export interface TeamPuzzleFilledSlotRecord {
  slotIndex: number;
  slotId: string;
  userId: string;
  occupantLabel: string;
  applicationId: string;
  roleLabel: string;
  approvedAt: string;
}

export interface TeamPuzzleFilledSlotsSnapshot {
  version: typeof TEAM_PUZZLE_FILLED_VERSION;
  slots: TeamPuzzleFilledSlotRecord[];
}

export function buildPuzzleSlotId(slotIndex: number): string {
  return `puzzle-slot-${slotIndex}`;
}

export function buildVibePuzzleSlotId(vibeSlotId: number): string {
  return `vibe-slot-${vibeSlotId}`;
}
