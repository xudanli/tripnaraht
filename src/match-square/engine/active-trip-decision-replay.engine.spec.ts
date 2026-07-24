import { COLLABORATIVE_TASK_FLYWHEEL_VERSION } from '../types/recruitment-task-flywheel.types';
import { ACTIVE_TRIP_DECISION_LOOP_VERSION } from '../types/active-trip-decision.types';
import { ROUTE_CONTRACT_LOCK_VERSION } from '../types/route-contract-lock.types';
import {
  buildActiveTripDecisionReplayView,
  buildRouteTemplateTripBackflowPreview,
} from './active-trip-decision-replay.engine';

describe('active-trip-decision-replay.engine', () => {
  const metadata = {
    matchSquareInstantiation: {
      recruitmentPostId: 'post-1',
      catalogId: 'is_laugavegur_55km_heavy_4d',
      routeDirectionName: 'IS_LAUGAVEGUR',
      crewUserIds: ['c1', 'm1', 'm2'],
    },
    collaborativeTaskFlywheel: {
      version: COLLABORATIVE_TASK_FLYWHEEL_VERSION,
      recruitmentPostId: 'post-1',
      dispatchedAt: '2026-06-07T00:00:00.000Z',
      tasks: [
        {
          taskId: 't1',
          templateId: 'ford_gear_shared_checklist',
          title: '复核涉水装备',
          description: '',
          assigneeUserId: 'm1',
          assigneeRoleLabel: '司机',
          priority: 'critical',
          status: 'confirmed',
          triggeredBy: { vibeChipIds: [], milestoneIds: [] },
          behaviorCaptureEnabled: true,
        },
      ],
      behaviorLog: [
        {
          eventId: 'e1',
          taskId: 't1',
          action: 'confirm',
          actorUserId: 'm1',
          at: '2026-06-07T02:00:00.000Z',
          revisionCountAfter: 0,
          responseLatencyMs: 7200000,
        },
      ],
    },
    activeTripDecisionLoop: {
      version: ACTIVE_TRIP_DECISION_LOOP_VERSION,
      pendingRollback: null,
      eventLog: [
        {
          eventId: 'r1',
          type: 'route_rollback',
          action: 'propose',
          actorUserId: 'c1',
          at: '2026-06-07T03:00:00.000Z',
          proposalId: 'p1',
          planBRef: 'rain-shelter-detour',
          milestoneId: 'day2_blind_nav',
        },
      ],
    },
    routeContractLock: {
      version: ROUTE_CONTRACT_LOCK_VERSION,
      locked: false,
      milestoneIds: ['fjordungakvisl_ford'],
      milestones: [
        {
          id: 'fjordungakvisl_ford',
          orderIndex: 0,
          vaultStatus: 'pending_authorization',
          authorizedByUserIds: [],
        },
      ],
      eventLog: [],
    },
  };

  it('builds unified timeline and Abu narrative', () => {
    const replay = buildActiveTripDecisionReplayView({
      tripId: 'trip-1',
      metadata,
      crewUserIds: ['c1', 'm1', 'm2'],
    });

    expect(replay.timeline.length).toBeGreaterThanOrEqual(2);
    expect(replay.abuNarrative).toMatch(/Abu/);
    expect(replay.personaSections.neptune).toMatch(/Neptune/);
    expect(replay.keyDecisionPoints.some((p) => p.titleZh.includes('Plan B'))).toBe(true);
  });

  it('builds template backflow preview', () => {
    const preview = buildRouteTemplateTripBackflowPreview({
      metadata,
      crewUserIds: ['c1', 'm1', 'm2'],
    });

    expect(preview?.catalogId).toBe('is_laugavegur_55km_heavy_4d');
    expect(preview?.anonymizedCrewSize).toBe(3);
    expect(preview?.featureTags.length).toBeGreaterThanOrEqual(0);
  });
});
