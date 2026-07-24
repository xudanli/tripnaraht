import { buildActiveTripDashboardView } from './active-trip-dashboard.engine';
import { COLLABORATIVE_TASK_FLYWHEEL_VERSION } from '../types/recruitment-task-flywheel.types';
import { ACTIVE_TRIP_DECISION_LOOP_VERSION } from '../types/active-trip-decision.types';

describe('buildActiveTripDashboardView', () => {
  const trip = {
    tripId: 'trip-1',
    name: '冰岛 · 兰格维格',
    destination: 'IS',
    startDate: '2026-07-01',
    endDate: '2026-07-04',
    status: 'PLANNING',
  };

  it('assembles dashboard sections from trip metadata', () => {
    const view = buildActiveTripDashboardView({
      trip,
      metadata: {
        matchSquareInstantiation: {
          recruitmentPostId: 'post-1',
          strategy: 'trekking_spawn',
          catalogId: 'is_laugavegur_55km_heavy_4d',
          recruitmentScriptId: 'iceland_laugavegur_heavy_trek',
          vibeChipIds: ['dem_blind_nav'],
          toolchainIds: ['offline_gis_pack'],
          contextualCardIds: ['offline_dem_pace_corridor', 'ford_window_planner'],
          vaultMilestoneIds: ['hut_landmannalaugar', 'fjordungakvisl_ford'],
          sealedAt: '2026-06-07T00:00:00.000Z',
        },
        routeContractLock: {
          version: 'route_contract_lock_v1',
          locked: true,
          milestoneIds: ['hut_landmannalaugar', 'fjordungakvisl_ford'],
          milestones: [
            {
              id: 'hut_landmannalaugar',
              orderIndex: 0,
              vaultStatus: 'locked',
              authorizedByUserIds: ['captain-1', 'member-1'],
            },
            {
              id: 'fjordungakvisl_ford',
              orderIndex: 1,
              vaultStatus: 'locked',
              authorizedByUserIds: ['captain-1', 'member-1'],
            },
          ],
          eventLog: [],
        },
        collaborativeTaskFlywheel: {
          version: COLLABORATIVE_TASK_FLYWHEEL_VERSION,
          recruitmentPostId: 'post-1',
          dispatchedAt: '2026-06-07T01:00:00.000Z',
          tasks: [
            {
              taskId: 't1',
              templateId: 'ford_gear_shared_checklist',
              title: '涉水装备',
              description: '清单',
              assigneeUserId: 'member-1',
              assigneeRoleLabel: '老司机',
              priority: 'critical',
              status: 'pending',
              triggeredBy: { vibeChipIds: [], milestoneIds: [] },
              behaviorCaptureEnabled: true,
            },
          ],
        },
        activeTripDecisionLoop: {
          version: ACTIVE_TRIP_DECISION_LOOP_VERSION,
          pendingRollback: null,
          eventLog: [],
        },
      },
      viewerUserId: 'member-1',
      viewerRole: 'member',
      planningStyle: 'full_managed',
      crew: [
        {
          userId: 'captain-1',
          role: 'captain',
          displayName: 'Danny',
          mbtiType: 'INTJ',
          cardTitle: '指挥官',
          interactionModeLabel: '指挥官',
          reputationStars: 4.8,
        },
        {
          userId: 'member-1',
          role: 'member',
          displayName: '队员',
          mbtiType: 'ISTP',
          cardTitle: '执行者',
          interactionModeLabel: null,
          reputationStars: 5,
        },
      ],
      requiredAuthorizations: 2,
    });

    expect(view.contextualCards.length).toBeGreaterThanOrEqual(1);
    expect(view.matchSquare?.strategy).toBe('trekking_spawn');
    expect(view.taskSummary.pending).toBe(1);
    expect(view.viewer.awaitingViewerAction).toBe('complete_assigned_task');
    expect(view.routeContractLock?.locked).toBe(true);
    expect(view.apiPaths.collaborativeTasks).toContain('trip-1');
  });

  it('flags member rollback confirmation when proposal pending', () => {
    const view = buildActiveTripDashboardView({
      trip,
      metadata: {
        activeTripDecisionLoop: {
          version: ACTIVE_TRIP_DECISION_LOOP_VERSION,
          pendingRollback: {
            proposalId: 'p1',
            proposedByUserId: 'captain-1',
            planBRef: 'plan-b',
            milestoneId: 'day2',
            evidenceRefs: [],
            note: null,
            proposedAt: new Date().toISOString(),
            status: 'pending',
            confirmations: [],
            protests: [],
            requiredConfirmations: 1,
            confirmLatencyMs: null,
          },
          eventLog: [],
        },
      },
      viewerUserId: 'member-1',
      viewerRole: 'member',
      crew: [],
    });

    expect(view.viewer.awaitingViewerAction).toBe('confirm_rollback_proposal');
  });
});
