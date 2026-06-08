import {
  applyMilestoneOrderRollback,
  applyVaultMilestoneAuthorization,
  buildRouteContractLockView,
  normalizeRouteContractLockMetadata,
} from './route-contract-lock.engine';
import { ROUTE_CONTRACT_LOCK_VERSION } from '../types/route-contract-lock.types';

describe('route-contract-lock.engine', () => {
  const crewSize = 2;

  it('authorizes milestones until contract sealed', () => {
    let lock = normalizeRouteContractLockMetadata({
      milestoneIds: ['a', 'b'],
      locked: false,
    })!;

    lock = applyVaultMilestoneAuthorization({
      lock,
      actorUserId: 'u1',
      requiredAuthorizations: crewSize,
    }).lock;
    lock = applyVaultMilestoneAuthorization({
      lock,
      actorUserId: 'u2',
      requiredAuthorizations: crewSize,
    }).lock;

    expect(lock.locked).toBe(true);
    expect(lock.milestones.every((m) => m.vaultStatus === 'locked')).toBe(true);
  });

  it('allows captain reorder when full_managed and not locked', () => {
    const lock = normalizeRouteContractLockMetadata({
      version: ROUTE_CONTRACT_LOCK_VERSION,
      locked: false,
      milestoneIds: ['a', 'b'],
      milestones: [
        { id: 'a', orderIndex: 0, vaultStatus: 'pending_authorization', authorizedByUserIds: [] },
        { id: 'b', orderIndex: 1, vaultStatus: 'pending_authorization', authorizedByUserIds: [] },
      ],
      eventLog: [],
    })!;

    const result = applyMilestoneOrderRollback({
      lock,
      actorUserId: 'captain',
      actorRole: 'captain',
      planningStyle: 'full_managed',
      milestoneIds: ['b', 'a'],
    });

    expect(result.lock.milestoneIds).toEqual(['b', 'a']);
    expect(result.lock.milestones.find((m) => m.id === 'b')?.orderIndex).toBe(0);
  });

  it('builds view with pending viewer milestones', () => {
    const lock = normalizeRouteContractLockMetadata({ milestoneIds: ['a'], locked: false })!;
    const view = buildRouteContractLockView({
      lock,
      viewerUserId: 'u1',
      viewerRole: 'member',
      requiredAuthorizations: 2,
    });

    expect(view.pendingViewerMilestoneIds).toEqual(['a']);
    expect(view.viewerCanAuthorize).toBe(true);
  });
});
