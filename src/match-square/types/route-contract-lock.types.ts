/** PRD 3.12 Phase 3 — Route Contract Lock × Trip Vault Schema */

export const ROUTE_CONTRACT_LOCK_VERSION = 'route_contract_lock_v1' as const;

export type VaultMilestoneStatus = 'pending_authorization' | 'authorized' | 'locked';

export interface VaultMilestoneContractRecord {
  id: string;
  orderIndex: number;
  vaultStatus: VaultMilestoneStatus;
  authorizedByUserIds: string[];
}

export interface RouteContractLockEventRecord {
  eventId: string;
  action: 'authorize' | 'reorder';
  actorUserId: string;
  at: string;
  milestoneId?: string | null;
  previousOrder?: string[];
  newOrder?: string[];
  note?: string | null;
}

export interface RouteContractLockMetadata {
  version: typeof ROUTE_CONTRACT_LOCK_VERSION;
  /** 全员授权完成后为 true */
  locked: boolean;
  milestoneIds: string[];
  milestones: VaultMilestoneContractRecord[];
  eventLog: RouteContractLockEventRecord[];
}

export interface RouteContractLockView {
  version: typeof ROUTE_CONTRACT_LOCK_VERSION;
  locked: boolean;
  milestoneIds: string[];
  milestones: Array<{
    id: string;
    labelZh: string;
    orderIndex: number;
    vaultStatus: VaultMilestoneStatus;
    authorizedByUserIds: string[];
    viewerHasAuthorized: boolean;
  }>;
  canCaptainRollbackMilestoneOrder: boolean;
  viewerCanAuthorize: boolean;
  pendingViewerMilestoneIds: string[];
  authorizationProgress: {
    requiredPerMilestone: number;
    fullyAuthorizedCount: number;
    totalMilestones: number;
  };
}

export interface RouteContractLockMutationResultView {
  tripId: string;
  lock: RouteContractLockView;
  event: RouteContractLockEventRecord;
  dnaScheduled: boolean;
}
