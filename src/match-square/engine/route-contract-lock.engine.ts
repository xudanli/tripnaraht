import { randomUUID } from 'crypto';
import { resolveVaultMilestoneLabels } from '../config/trip-contextual-cards.config';
import type {
  RouteContractLockEventRecord,
  RouteContractLockMetadata,
  RouteContractLockView,
  VaultMilestoneContractRecord,
  VaultMilestoneStatus,
} from '../types/route-contract-lock.types';
import { ROUTE_CONTRACT_LOCK_VERSION } from '../types/route-contract-lock.types';

export interface LegacyRouteContractLockMetadata {
  locked?: boolean;
  milestoneIds?: string[];
}

export function createInitialRouteContractLock(milestoneIds: string[]): RouteContractLockMetadata {
  const milestones: VaultMilestoneContractRecord[] = milestoneIds.map((id, index) => ({
    id,
    orderIndex: index,
    vaultStatus: 'pending_authorization',
    authorizedByUserIds: [],
  }));

  return {
    version: ROUTE_CONTRACT_LOCK_VERSION,
    locked: false,
    milestoneIds: [...milestoneIds],
    milestones,
    eventLog: [],
  };
}

export function normalizeRouteContractLockMetadata(raw: unknown): RouteContractLockMetadata | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  if (obj.version === ROUTE_CONTRACT_LOCK_VERSION) {
    const lock = raw as RouteContractLockMetadata;
    if (!Array.isArray(lock.milestones) || !Array.isArray(lock.milestoneIds)) return null;
    return lock;
  }

  const legacy = raw as LegacyRouteContractLockMetadata;
  if (!Array.isArray(legacy.milestoneIds) || legacy.milestoneIds.length === 0) return null;

  const lock = createInitialRouteContractLock(legacy.milestoneIds);
  if (legacy.locked) {
    return sealRouteContractLock(lock);
  }
  return lock;
}

function sealRouteContractLock(lock: RouteContractLockMetadata): RouteContractLockMetadata {
  return {
    ...lock,
    locked: true,
    milestones: lock.milestones.map((m) => ({
      ...m,
      vaultStatus: 'locked',
    })),
  };
}

function milestoneStatus(
  milestone: VaultMilestoneContractRecord,
  requiredAuthorizations: number,
): VaultMilestoneStatus {
  if (milestone.vaultStatus === 'locked') return 'locked';
  if (milestone.authorizedByUserIds.length >= requiredAuthorizations) return 'authorized';
  return 'pending_authorization';
}

function recomputeContractLock(
  lock: RouteContractLockMetadata,
  requiredAuthorizations: number,
): RouteContractLockMetadata {
  const milestones = lock.milestones.map((m) => {
    const status = milestoneStatus(m, requiredAuthorizations);
    return { ...m, vaultStatus: status };
  });

  const allLocked = milestones.every((m) => m.vaultStatus === 'authorized' || m.vaultStatus === 'locked');
  const sealed = allLocked && milestones.length > 0;

  return {
    ...lock,
    locked: sealed,
    milestones: sealed
      ? milestones.map((m) => ({ ...m, vaultStatus: 'locked' as VaultMilestoneStatus }))
      : milestones,
    milestoneIds: [...milestones].sort((a, b) => a.orderIndex - b.orderIndex).map((m) => m.id),
  };
}

export function buildRouteContractLockView(input: {
  lock: RouteContractLockMetadata;
  viewerUserId: string;
  viewerRole: 'captain' | 'member';
  planningStyle?: string | null;
  requiredAuthorizations: number;
}): RouteContractLockView {
  const labels = new Map(resolveVaultMilestoneLabels(input.lock.milestoneIds).map((m) => [m.id, m.labelZh]));
  const pendingViewerMilestoneIds: string[] = [];

  const milestones = [...input.lock.milestones]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((m) => {
      const viewerHasAuthorized = m.authorizedByUserIds.includes(input.viewerUserId);
      if (!viewerHasAuthorized && m.vaultStatus === 'pending_authorization') {
        pendingViewerMilestoneIds.push(m.id);
      }
      return {
        id: m.id,
        labelZh: labels.get(m.id) ?? m.id,
        orderIndex: m.orderIndex,
        vaultStatus: m.vaultStatus,
        authorizedByUserIds: [...m.authorizedByUserIds],
        viewerHasAuthorized,
      };
    });

  const fullyAuthorizedCount = milestones.filter(
    (m) => m.vaultStatus === 'authorized' || m.vaultStatus === 'locked',
  ).length;

  return {
    version: ROUTE_CONTRACT_LOCK_VERSION,
    locked: input.lock.locked,
    milestoneIds: input.lock.milestoneIds,
    milestones,
    canCaptainRollbackMilestoneOrder:
      input.viewerRole === 'captain' && input.planningStyle === 'full_managed' && !input.lock.locked,
    viewerCanAuthorize: pendingViewerMilestoneIds.length > 0 && !input.lock.locked,
    pendingViewerMilestoneIds,
    authorizationProgress: {
      requiredPerMilestone: input.requiredAuthorizations,
      fullyAuthorizedCount,
      totalMilestones: milestones.length,
    },
  };
}

export function applyVaultMilestoneAuthorization(input: {
  lock: RouteContractLockMetadata;
  actorUserId: string;
  requiredAuthorizations: number;
  milestoneId?: string | null;
  at?: string;
}): { lock: RouteContractLockMetadata; event: RouteContractLockEventRecord; dnaUserIds: string[] } {
  if (input.lock.locked) {
    throw new Error('Route Contract 已全员锁定，无法继续授权');
  }

  const at = input.at ?? new Date().toISOString();
  const targetIds = input.milestoneId
    ? [input.milestoneId]
    : input.lock.milestones
        .filter((m) => !m.authorizedByUserIds.includes(input.actorUserId))
        .map((m) => m.id);

  if (targetIds.length === 0) {
    throw new Error('没有待授权的里程碑');
  }

  const milestones = input.lock.milestones.map((m) => {
    if (!targetIds.includes(m.id)) return m;
    if (m.authorizedByUserIds.includes(input.actorUserId)) return m;
    return {
      ...m,
      authorizedByUserIds: [...m.authorizedByUserIds, input.actorUserId],
    };
  });

  const next = recomputeContractLock(
    { ...input.lock, milestones, eventLog: input.lock.eventLog },
    input.requiredAuthorizations,
  );

  const event: RouteContractLockEventRecord = {
    eventId: randomUUID(),
    action: 'authorize',
    actorUserId: input.actorUserId,
    at,
    milestoneId: input.milestoneId ?? null,
  };

  const dnaUserIds = next.locked
    ? [...new Set(milestones.flatMap((m) => m.authorizedByUserIds))]
    : [input.actorUserId];

  return {
    lock: { ...next, eventLog: [...next.eventLog, event] },
    event,
    dnaUserIds,
  };
}

export function applyMilestoneOrderRollback(input: {
  lock: RouteContractLockMetadata;
  actorUserId: string;
  actorRole: 'captain' | 'member';
  planningStyle?: string | null;
  milestoneIds: string[];
  note?: string | null;
  at?: string;
}): { lock: RouteContractLockMetadata; event: RouteContractLockEventRecord } {
  if (input.actorRole !== 'captain') {
    throw new Error('仅队长可调整 Route Contract 里程碑顺序');
  }
  if (input.planningStyle !== 'full_managed') {
    throw new Error('仅全托管招募方可 rollback 里程碑顺序');
  }
  if (input.lock.locked) {
    throw new Error('Contract 已锁定，不可调整顺序');
  }

  const existingIds = new Set(input.lock.milestones.map((m) => m.id));
  if (input.milestoneIds.length !== existingIds.size) {
    throw new Error('milestoneIds 必须与现有里程碑数量一致');
  }
  for (const id of input.milestoneIds) {
    if (!existingIds.has(id)) {
      throw new Error(`未知里程碑: ${id}`);
    }
  }

  const at = input.at ?? new Date().toISOString();
  const previousOrder = [...input.lock.milestoneIds];
  const byId = new Map(input.lock.milestones.map((m) => [m.id, m]));

  const milestones = input.milestoneIds.map((id, orderIndex) => ({
    ...byId.get(id)!,
    orderIndex,
  }));

  const event: RouteContractLockEventRecord = {
    eventId: randomUUID(),
    action: 'reorder',
    actorUserId: input.actorUserId,
    at,
    previousOrder,
    newOrder: [...input.milestoneIds],
    note: input.note ?? null,
  };

  return {
    lock: {
      ...input.lock,
      milestoneIds: [...input.milestoneIds],
      milestones,
      eventLog: [...input.lock.eventLog, event],
    },
    event,
  };
}
