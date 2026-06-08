import type { ActiveTripReplayFlywheelMetrics } from '../types/active-trip-decision-replay.types';
import { PRE_MATCH_DECISION_VERSION } from '../types/recruitment-task-flywheel.types';
import {
  buildCollaborativeFlywheelObservationExport,
  compareCollaborativeFlywheelFingerprints,
  computeReplayComparableObservationFingerprint,
  computeReplayComparablePredictionFingerprint,
  buildCollaborativeFlywheelPredictionExport,
} from './collaborative-flywheel-replay-audit.util';

const icelandBrief = {
  version: PRE_MATCH_DECISION_VERSION,
  hardMetricsPass: true,
  inTripCollaborationNoisePercent: 18,
  noiseDrivers: [{ factorId: 'dem_blind_nav_x_anxiety', label: '内陆断网盲导 × 高焦虑', weight: 18 }],
  suggestedSceneRoleAnchor: 'blind_box_follower' as const,
  suggestedSceneRoleLabel: '🧩 盲盒跟从者',
  mitigatingTaskTemplateIds: ['pre_trip_safety_blueprint'],
  narrativeLine: '🤖 TripNARA 决策引擎提示…',
};

const baseMetrics: ActiveTripReplayFlywheelMetrics = {
  collaborativeTaskEvents: 2,
  routeRollbackEvents: 2,
  vaultContractEvents: 0,
  taskConfirmLatencyMsAvg: 45_000,
  routeRollbackConfirmLatencyMs: null,
  taskRevisionTotal: 0,
};

describe('collaborative-flywheel-replay-audit.util', () => {
  it('computes stable replay-comparable fingerprints', () => {
    const pred = buildCollaborativeFlywheelPredictionExport(icelandBrief, '2026-01-01T00:00:00.000Z');
    const fp1 = computeReplayComparablePredictionFingerprint(pred);
    const fp2 = computeReplayComparablePredictionFingerprint(
      buildCollaborativeFlywheelPredictionExport(icelandBrief, '2026-06-08T12:00:00.000Z'),
    );
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });

  it('passes audit when high noise predicted and protest observed', () => {
    const observation = buildCollaborativeFlywheelObservationExport({
      flywheelMetrics: baseMetrics,
      timeline: [
        {
          eventId: 'e1',
          at: '2026-06-07T01:00:00.000Z',
          source: 'route_rollback',
          action: 'propose',
          actorUserId: 'captain',
          summaryZh: '队长发起 Plan B',
        },
        {
          eventId: 'e2',
          at: '2026-06-07T01:01:00.000Z',
          source: 'route_rollback',
          action: 'protest',
          actorUserId: 'member',
          summaryZh: '队员异议',
        },
      ],
    });

    const report = compareCollaborativeFlywheelFingerprints({
      prediction: icelandBrief,
      observation,
      dispatchedMitigatingTemplateIds: ['pre_trip_safety_blueprint'],
    });

    expect(report.match).toBe(true);
    expect(report.signals.noisePredictionValidated).toBe(true);
    expect(report.signals.roleAnchorObserved).toBe(true);
    expect(report.assertions.find((a) => a.id === 'noise_prediction_validated')?.passed).toBe(true);
  });

  it('fails audit when high noise predicted but no friction observed', () => {
    const observation = buildCollaborativeFlywheelObservationExport({
      flywheelMetrics: {
        ...baseMetrics,
        routeRollbackEvents: 0,
        taskConfirmLatencyMsAvg: 5_000,
        collaborativeTaskEvents: 1,
      },
      timeline: [
        {
          eventId: 'e1',
          at: '2026-06-07T01:00:00.000Z',
          source: 'collaborative_task',
          action: 'confirm',
          actorUserId: 'member',
          summaryZh: '普通任务确认',
        },
      ],
    });

    const report = compareCollaborativeFlywheelFingerprints({
      prediction: icelandBrief,
      observation,
      dispatchedMitigatingTemplateIds: ['pre_trip_safety_blueprint'],
    });

    expect(report.match).toBe(false);
    expect(report.signals.noisePredictionValidated).toBe(false);
  });

  it('observation fingerprint ignores capturedAtIso', () => {
    const obs = buildCollaborativeFlywheelObservationExport({
      flywheelMetrics: baseMetrics,
      timeline: [],
      capturedAtIso: '2026-01-01T00:00:00.000Z',
    });
    const fpA = computeReplayComparableObservationFingerprint(obs);
    const fpB = computeReplayComparableObservationFingerprint({
      ...obs,
      capturedAtIso: '2026-12-31T23:59:59.000Z',
    });
    expect(fpA).toBe(fpB);
  });
});
