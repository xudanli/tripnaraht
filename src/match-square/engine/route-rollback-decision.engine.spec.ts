import type { ActiveTripDecisionLoopMetadata } from '../types/active-trip-decision.types';
import { ACTIVE_TRIP_DECISION_LOOP_VERSION } from '../types/active-trip-decision.types';
import {
  applyRouteRollbackDecisionEvent,
  emptyActiveTripDecisionLoop,
} from './route-rollback-decision.engine';

describe('applyRouteRollbackDecisionEvent', () => {
  const emptyLoop = (): ActiveTripDecisionLoopMetadata => emptyActiveTripDecisionLoop();

  it('captain proposes rollback and members confirm to completion', () => {
    let loop = emptyLoop();

    const proposed = applyRouteRollbackDecisionEvent({
      loop,
      action: 'propose',
      actorUserId: 'captain-1',
      actorRole: 'captain',
      memberCollaboratorCount: 2,
      planBRef: 'plan-b-rain-shelter',
      milestoneId: 'day2_blind_nav',
    });
    loop = proposed.loop;
    expect(proposed.pendingRollback?.status).toBe('pending');
    expect(proposed.awaitingMemberConfirmations).toBe(true);

    const c1 = applyRouteRollbackDecisionEvent({
      loop,
      action: 'confirm',
      actorUserId: 'member-1',
      actorRole: 'member',
      memberCollaboratorCount: 2,
    });
    loop = c1.loop;
    expect(c1.pendingRollback?.status).toBe('pending');
    expect(c1.dnaReasons).toHaveLength(0);

    const c2 = applyRouteRollbackDecisionEvent({
      loop,
      action: 'confirm',
      actorUserId: 'member-2',
      actorRole: 'member',
      memberCollaboratorCount: 2,
    });

    expect(c2.pendingRollback).toBeNull();
    expect(c2.dnaReasons).toContain('NEGOTIATION_CONFIRMED');
    expect(c2.loop.pendingRollback).toBeNull();
    expect(c2.loop.eventLog.some((e) => e.note === 'route.rollback_confirmed')).toBe(true);
  });

  it('member protest cancels pending rollback', () => {
    let loop = applyRouteRollbackDecisionEvent({
      loop: emptyLoop(),
      action: 'propose',
      actorUserId: 'captain-1',
      actorRole: 'captain',
      memberCollaboratorCount: 1,
      planBRef: 'plan-b',
    }).loop;

    const protest = applyRouteRollbackDecisionEvent({
      loop,
      action: 'protest',
      actorUserId: 'member-1',
      actorRole: 'member',
      memberCollaboratorCount: 1,
      note: '今日体力不足以改线',
    });

    expect(protest.pendingRollback).toBeNull();
    expect(protest.dnaReasons).toContain('NEGOTIATION_ROLLED_BACK');
  });

  it('rejects duplicate propose while pending', () => {
    const loop = applyRouteRollbackDecisionEvent({
      loop: emptyLoop(),
      action: 'propose',
      actorUserId: 'captain-1',
      actorRole: 'captain',
      memberCollaboratorCount: 1,
      planBRef: 'plan-a',
    }).loop;

    expect(() =>
      applyRouteRollbackDecisionEvent({
        loop,
        action: 'propose',
        actorUserId: 'captain-1',
        actorRole: 'captain',
        memberCollaboratorCount: 1,
        planBRef: 'plan-b',
      }),
    ).toThrow(/已有待确认/);
  });
});
