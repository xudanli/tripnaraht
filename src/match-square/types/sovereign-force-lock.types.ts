/** PRD 3.15 — 队长强制成团 / Sovereign Lock */

export const SOVEREIGN_FORCE_LOCK_SNAPSHOT_KEY = '_sovereignForceLock_v1' as const;
export const SOVEREIGN_FORCE_LOCK_VERSION = 'sovereign_force_lock_v1' as const;

export interface SovereignForceLockDroppedSlotView {
  slotIndex: number;
  slotId: string | null;
  roleLabel: string;
  deficitTag: string;
}

export interface SovereignForceLockVaultRecalcView {
  previousSplitBase: number;
  actualSplitBase: number;
  budgetPerPersonCents: number | null;
  summaryLine: string;
}

export interface SovereignForceLockCrewMemberView {
  userId: string;
  role: 'captain' | 'member';
  slotLabel: string;
  displayName: string | null;
  applicationId?: string;
}

export interface SovereignForceLockRecord {
  version: typeof SOVEREIGN_FORCE_LOCK_VERSION;
  lockedAt: string;
  lockedByUserId: string;
  note: string | null;
  originalSlotsNeeded: number;
  effectiveSlotsNeeded: number;
  droppedOpenSlots: SovereignForceLockDroppedSlotView[];
  physicalDeficits: string[];
  resilienceScore: number;
  vaultRecalc: SovereignForceLockVaultRecalcView;
  pendingApplicationsRejected: number;
  taskRebalanceNote: string | null;
}

export interface SovereignForceLockPreviewView {
  postId: string;
  canForceLock: boolean;
  blockReason: string | null;
  currentCrew: SovereignForceLockCrewMemberView[];
  droppedOpenSlots: SovereignForceLockDroppedSlotView[];
  physicalDeficits: string[];
  resilienceScore: number;
  vaultRecalc: SovereignForceLockVaultRecalcView;
  pendingApplicationsToReject: number;
  confirmHeadline: string;
  confirmLines: string[];
}

export interface SovereignForceLockResultView {
  postId: string;
  sovereignLock: SovereignForceLockRecord;
  rejectedApplicationIds: string[];
  instantiation: import('./trip-instantiation.types').TripInstantiationResultView | null;
  activeTripPath: string | null;
  dnaScheduled: boolean;
}
