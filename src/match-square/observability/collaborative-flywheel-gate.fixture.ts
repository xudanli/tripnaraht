/**
 * CI gate golden fixture — 冰岛兰格维格 × 高焦虑 blind_box_follower（无 DB / 无 HTTP）
 */
import { PRE_MATCH_DECISION_VERSION } from '../types/recruitment-task-flywheel.types';
import type { CompareCollaborativeFlywheelInput } from './collaborative-flywheel-replay-audit.util';
import { buildCollaborativeFlywheelObservationExport } from './collaborative-flywheel-replay-audit.util';

export const COLLAB_FLYWHEEL_GATE_FIXTURE_ID = 'iceland_laugavegur_anxious_blind_box_v1';

export function buildCollabFlywheelGateFixture(): CompareCollaborativeFlywheelInput {
  const observation = buildCollaborativeFlywheelObservationExport({
    flywheelMetrics: {
      collaborativeTaskEvents: 2,
      routeRollbackEvents: 2,
      vaultContractEvents: 0,
      taskConfirmLatencyMsAvg: null,
      routeRollbackConfirmLatencyMs: null,
      taskRevisionTotal: 0,
    },
    timeline: [
      {
        eventId: 'gate-e1',
        at: '2026-06-07T01:00:00.000Z',
        source: 'collaborative_task',
        action: 'confirm',
        actorUserId: 'member-anxious',
        summaryZh: '✅ 复核全队涉水鞋与涉水杖备选公摊',
      },
      {
        eventId: 'gate-e2',
        at: '2026-06-07T02:00:00.000Z',
        source: 'route_rollback',
        action: 'propose',
        actorUserId: 'captain',
        summaryZh: '🧭 队长发起 Plan B：route_plan_b_fjordungakvisl_detour_v1',
      },
      {
        eventId: 'gate-e3',
        at: '2026-06-07T02:01:00.000Z',
        source: 'route_rollback',
        action: 'protest',
        actorUserId: 'member-anxious',
        summaryZh: '🙅 队员对 Plan B 提出异议',
      },
    ],
  });

  return {
    prediction: {
      version: PRE_MATCH_DECISION_VERSION,
      hardMetricsPass: true,
      inTripCollaborationNoisePercent: 18,
      noiseDrivers: [
        {
          factorId: 'dem_blind_nav_x_anxiety',
          label: '内陆断网盲导 × 高焦虑询问倾向',
          weight: 18,
        },
      ],
      suggestedSceneRoleAnchor: 'blind_box_follower',
      suggestedSceneRoleLabel: '🧩 盲盒跟从者',
      mitigatingTaskTemplateIds: ['pre_trip_safety_blueprint'],
      narrativeLine: '🤖 TripNARA 决策引擎提示…',
    },
    observation,
    dispatchedMitigatingTemplateIds: [
      'satellite_dem_offline_verify',
      'ford_gear_shared_checklist',
      'pre_trip_safety_blueprint',
    ],
    noiseThresholdPercent: 15,
  };
}
