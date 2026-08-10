import {
  freezeInterventionCandidate,
  type InterventionCandidateV1,
} from './intervention-candidate.util';
import { labelInterventionGroundTruth } from './intervention-ground-truth.util';
import {
  defineUsefulInterventionWindow,
  evaluateInterventionTiming,
} from './useful-intervention-window.util';
import {
  evaluateInterventionCandidate,
  summarizeInterventionEvaluations,
} from './intervention-evaluation.util';
import {
  admitInterventionCandidate,
  createInterventionDedupState,
} from './dedup-cooldown-hysteresis.util';
import {
  applyCandidateToActiveState,
  createActiveInterventionState,
  resolveActiveIntervention,
} from './active-intervention-state.util';
import {
  assertNotificationChannelsClosed,
  checkProactiveReadinessGate,
} from './proactive-readiness-gate.util';

describe('Intervention Intelligence Validation', () => {
  const scenarioId = 'pace_day_sequence' as const;

  function cand(
    overrides: Partial<Parameters<typeof freezeInterventionCandidate>[0]> & {
      riskEventKey?: string;
    } = {},
  ): InterventionCandidateV1 {
    return freezeInterventionCandidate({
      scenarioId,
      tripId: 'trip_ii',
      riskEventKey: overrides.riskEventKey ?? 'fatigue_day2',
      severity: overrides.severity ?? 0.8,
      urgency: overrides.urgency ?? 0.7,
      confidence: overrides.confidence ?? 0.75,
      actionability: overrides.actionability ?? 0.7,
      actionableLeadTimeHours: overrides.actionableLeadTimeHours ?? 12,
      disruptionCost: overrides.disruptionCost ?? 0.3,
      createdAt: overrides.createdAt ?? '2026-08-07T10:00:00.000Z',
      candidateId: overrides.candidateId,
    });
  }

  it('freezes InterventionCandidate with required fields and 3-level shadow', () => {
    const interrupt = cand();
    expect(interrupt.schemaId).toBe('nara.intervention_candidate@v1');
    expect(interrupt.severity).toBeDefined();
    expect(interrupt.urgency).toBeDefined();
    expect(interrupt.confidence).toBeDefined();
    expect(interrupt.actionability).toBeDefined();
    expect(interrupt.actionableLeadTimeHours).toBeDefined();
    expect(interrupt.disruptionCost).toBeDefined();
    expect(interrupt.surfaceLevel).toBe('INTERRUPT_CANDIDATE');
    expect(interrupt.notifyUser).toBe(false);
    expect(interrupt.usefulInformationIsNotWorthInterrupting).toBe(true);

    const passive = cand({
      severity: 0.55,
      urgency: 0.4,
      actionability: 0.45,
      disruptionCost: 0.45,
      candidateId: 'c_passive',
    });
    expect(passive.surfaceLevel).toBe('SURFACE_PASSIVELY');

    const none = cand({
      disruptionCost: 0.9,
      actionability: 0.2,
      candidateId: 'c_none',
    });
    expect(none.surfaceLevel).toBe('DO_NOT_SURFACE');
  });

  it('evaluates Over/Missed/TooEarly/TooLate vs human GT', () => {
    const overCand = cand({ candidateId: 'over_1' });
    const overGt = labelInterventionGroundTruth({
      candidate: overCand,
      label: 'SHOULD_NOT_INTERRUPT',
      labeledBy: 'reviewer_a',
    });
    expect(
      evaluateInterventionCandidate({
        candidate: overCand,
        groundTruth: overGt,
      }).kind,
    ).toBe('OVER_INTERVENTION');

    const missCand = cand({
      disruptionCost: 0.9,
      candidateId: 'miss_1',
    });
    expect(missCand.surfaceLevel).toBe('DO_NOT_SURFACE');
    const missGt = labelInterventionGroundTruth({
      candidate: missCand,
      label: 'SHOULD_INTERRUPT',
      labeledBy: 'reviewer_a',
    });
    expect(
      evaluateInterventionCandidate({
        candidate: missCand,
        groundTruth: missGt,
      }).kind,
    ).toBe('MISSED_INTERVENTION');

    const earlyCand = cand({ candidateId: 'early_1' });
    const window = defineUsefulInterventionWindow({
      candidate: earlyCand,
      eventInHours: 48,
      windowStartHoursBeforeEvent: 36,
      windowEndHoursBeforeEvent: 2,
    });
    const timing = evaluateInterventionTiming(window);
    expect(timing.kind).toBe('TOO_EARLY');
    const earlyGt = labelInterventionGroundTruth({
      candidate: earlyCand,
      label: 'SHOULD_INTERRUPT',
      labeledBy: 'reviewer_a',
    });
    expect(
      evaluateInterventionCandidate({
        candidate: earlyCand,
        groundTruth: earlyGt,
        timing,
      }).kind,
    ).toBe('TOO_EARLY');

    const lateCand = cand({ candidateId: 'late_1' });
    const lateWin = defineUsefulInterventionWindow({
      candidate: lateCand,
      eventInHours: 0.5,
      windowStartHoursBeforeEvent: 36,
      windowEndHoursBeforeEvent: 2,
    });
    expect(evaluateInterventionTiming(lateWin).kind).toBe('TOO_LATE');
  });

  it('Dedup/Cooldown/Hysteresis + Active lifecycle for same event', () => {
    let dedup = createInterventionDedupState({
      tripId: 'trip_ii',
      riskEventKey: 'fatigue_day2',
    });
    const c1 = cand({ candidateId: 'c1', createdAt: '2026-08-07T10:00:00.000Z' });
    const a1 = admitInterventionCandidate({
      state: dedup,
      candidate: c1,
      now: '2026-08-07T10:00:00.000Z',
      cooldownHours: 6,
    });
    expect(a1.ok).toBe(true);
    if (a1.ok) dedup = a1.nextState;

    const c2 = cand({ candidateId: 'c2', createdAt: '2026-08-07T11:00:00.000Z' });
    const a2 = admitInterventionCandidate({
      state: dedup,
      candidate: c2,
      now: '2026-08-07T11:00:00.000Z',
      cooldownHours: 6,
    });
    expect(a2.ok).toBe(false);
    if (!a2.ok) {
      expect(['COOLDOWN', 'DEDUP']).toContain(a2.reason);
    }

    let active = createActiveInterventionState({
      tripId: 'trip_ii',
      riskEventKey: 'fatigue_day2',
      scenarioId,
    });
    active = applyCandidateToActiveState({ state: active, candidate: c1 });
    expect(active.phase).toBe('INTERRUPT_SHADOW');
    expect(active.singleLifecyclePerEvent).toBe(true);
    expect(active.notifyUser).toBe(false);
    active = resolveActiveIntervention({ state: active, outcome: 'RESOLVED' });
    expect(active.phase).toBe('RESOLVED');
    expect(() =>
      applyCandidateToActiveState({ state: active, candidate: c2 }),
    ).toThrow(/lifecycle_closed/);
  });

  it('DoD: Shadow proves interrupt worth + timing; Proactive Gate keeps notify closed', () => {
    const rows = [
      {
        c: cand({ candidateId: 'ok_i', disruptionCost: 0.25 }),
        label: 'SHOULD_INTERRUPT' as const,
        eventInHours: 18,
      },
      {
        c: cand({
          candidateId: 'ok_s',
          severity: 0.5,
          urgency: 0.35,
          actionability: 0.4,
          disruptionCost: 0.5,
        }),
        label: 'SHOULD_NOT_INTERRUPT' as const,
        eventInHours: 18,
      },
      {
        c: cand({ candidateId: 'ok_i2', disruptionCost: 0.2 }),
        label: 'SHOULD_INTERRUPT' as const,
        eventInHours: 20,
      },
      {
        c: cand({
          candidateId: 'ok_s2',
          disruptionCost: 0.85,
          actionability: 0.15,
        }),
        label: 'SHOULD_NOT_INTERRUPT' as const,
        eventInHours: 20,
      },
      {
        c: cand({ candidateId: 'ok_i3', disruptionCost: 0.22 }),
        label: 'SHOULD_INTERRUPT' as const,
        eventInHours: 16,
      },
      {
        c: cand({
          candidateId: 'ok_s3',
          severity: 0.45,
          urgency: 0.4,
          actionability: 0.42,
          disruptionCost: 0.48,
        }),
        label: 'SHOULD_NOT_INTERRUPT' as const,
        eventInHours: 16,
      },
    ];

    const evals = rows.map((r) => {
      const win = defineUsefulInterventionWindow({
        candidate: r.c,
        eventInHours: r.eventInHours,
      });
      const timing = evaluateInterventionTiming(win);
      expect(timing.kind).toBe('ON_TIME');
      const gt = labelInterventionGroundTruth({
        candidate: r.c,
        label: r.label,
        labeledBy: 'reviewer_b',
      });
      return evaluateInterventionCandidate({
        candidate: r.c,
        groundTruth: gt,
        timing,
      });
    });

    const quality = summarizeInterventionEvaluations({
      evaluations: evals,
      minSamples: 5,
    });
    expect(quality.passed).toBe(true);
    expect(quality.overInterventionRate).toBe(0);
    expect(quality.notifyUserStillForbidden).toBe(true);

    const gate = checkProactiveReadinessGate({
      scenarioId,
      temporalQuality: {
        scenarioId,
        qualityGatePassed: true,
      },
      decisionUtility: { scenarioId, passed: true },
      interventionQuality: quality,
    });
    expect(gate.temporalQualityPassed).toBe(true);
    expect(gate.decisionUtilityPassed).toBe(true);
    expect(gate.interventionQualityPassed).toBe(true);
    expect(gate.allowNotifyUser).toBe(false);
    expect(gate.notificationClosed).toBe(true);
    expect(gate.pushClosed).toBe(true);
    expect(gate.autoApplyClosed).toBe(true);
    expect(gate.dodFocusZh).toMatch(/值得打断|过度提醒/);

    const closed = assertNotificationChannelsClosed(gate);
    expect(closed.ok).toBe(false);
    expect(closed.code).toBe('NOTIFICATION_CHANNELS_CLOSED');
  });
});
