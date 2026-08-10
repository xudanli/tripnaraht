import { setUserProactivePreference } from './user-proactive-preference.util';
import { recordProactiveBehaviorObservation } from './proactive-behavior-observation.util';
import { evaluateSilenceQuality } from './silence-evaluation.util';
import { buildProactiveLongitudinalReport } from './proactive-longitudinal-report.util';
import {
  assertNoGlobalProactiveFlag,
  createEmptyProactiveAuthorityRegistry,
  grantProactiveAuthority,
  isProactiveAuthorized,
} from './proactive-authority.util';
import {
  authorizePushDelivery,
  checkComprehensiveNotificationReadiness,
} from './notification-readiness-comprehensive.util';
import { assertAutoActionsClosed } from '../proactive-surface-pilot/notification-readiness-gate.util';

describe('Proactive Behavior Validation', () => {
  const scenarioId = 'pace_day_sequence' as const;
  const tripId = 'trip_pbv';

  it('Preference is not Authority; global proactive=true forbidden', () => {
    const pref = setUserProactivePreference({
      userId: 'u1',
      defaultLevel: 'PUSH_OK_IF_AUTHORIZED',
    });
    expect(pref.preferenceIsNotNotificationAuthority).toBe(true);
    expect(pref.notificationPermissionIsNotNotificationAuthority).toBe(true);

    expect(() => assertNoGlobalProactiveFlag({ globalProactive: true })).toThrow(
      /global_proactive_true_forbidden/,
    );

    let reg = createEmptyProactiveAuthorityRegistry();
    expect(
      isProactiveAuthorized({
        registry: reg,
        scenarioId,
        deliveryLevel: 'PUSH',
      }),
    ).toBe(false);

    reg = grantProactiveAuthority({
      registry: reg,
      scenarioId,
      deliveryLevel: 'L1_PASSIVE',
      grantedBy: 'harness_reviewer',
      reasonZh: '仅授权 L1',
    });
    expect(
      isProactiveAuthorized({
        registry: reg,
        scenarioId,
        deliveryLevel: 'L1_PASSIVE',
      }),
    ).toBe(true);
    expect(
      isProactiveAuthorized({
        registry: reg,
        scenarioId,
        deliveryLevel: 'PUSH',
      }),
    ).toBe(false);
  });

  it('SilenceEvaluation balances over-reminder and over-silence', () => {
    const obs = [
      recordProactiveBehaviorObservation({
        tripId,
        dayKey: 'd1',
        scenarioId,
        deliveryLevel: 'L1_PASSIVE',
        kind: 'USEFUL',
        surfaced: true,
      }),
      recordProactiveBehaviorObservation({
        tripId,
        dayKey: 'd1',
        scenarioId,
        deliveryLevel: 'NONE',
        kind: 'SUPPRESSED_CORRECT',
        surfaced: false,
      }),
      recordProactiveBehaviorObservation({
        tripId,
        dayKey: 'd1',
        scenarioId,
        deliveryLevel: 'NONE',
        kind: 'SUPPRESSED_CORRECT',
        surfaced: false,
      }),
    ];
    const silence = evaluateSilenceQuality({ tripId, observations: obs });
    expect(silence.usefulSurfaceIsNotSustainableExperience).toBe(true);
    expect(silence.passed).toBe(true);
    expect(silence.overReminderRate).toBe(0);
  });

  it('DoD: longitudinal trip quality + comprehensive readiness + scenario×level push', () => {
    const observations = [];
    for (const day of ['2026-08-08', '2026-08-09', '2026-08-10']) {
      observations.push(
        recordProactiveBehaviorObservation({
          tripId,
          dayKey: day,
          scenarioId,
          deliveryLevel: 'L1_PASSIVE',
          kind: 'USEFUL',
          surfaced: true,
        }),
        recordProactiveBehaviorObservation({
          tripId,
          dayKey: day,
          scenarioId,
          deliveryLevel: 'L2_IN_APP_INTERRUPT',
          kind: 'SNOOZE',
          surfaced: true,
        }),
        recordProactiveBehaviorObservation({
          tripId,
          dayKey: day,
          scenarioId,
          deliveryLevel: 'NONE',
          kind: 'SUPPRESSED_CORRECT',
          surfaced: false,
        }),
        recordProactiveBehaviorObservation({
          tripId,
          dayKey: day,
          scenarioId,
          deliveryLevel: 'NONE',
          kind: 'SUPPRESSED_CORRECT',
          surfaced: false,
        }),
      );
    }

    const report = buildProactiveLongitudinalReport({
      tripId,
      scenarioId,
      observations,
      minDays: 3,
    });
    expect(report.dayRows).toHaveLength(3);
    expect(report.usefulSurfaceIsNotSustainableExperience).toBe(true);
    expect(report.sustainable).toBe(true);
    expect(report.retentionWillingnessScore).toBeGreaterThanOrEqual(0.55);
    expect(report.dodFocusZh).toMatch(/完整旅行周期|长期保留/);

    const pref = setUserProactivePreference({
      userId: 'u1',
      defaultLevel: 'L2_IN_APP_OK',
      perScenario: { [scenarioId]: 'PUSH_OK_IF_AUTHORIZED' },
    });

    const notReady = checkComprehensiveNotificationReadiness({
      scenarioId,
      dimensions: {
        temporalQualityPassed: true,
        decisionUtilityPassed: true,
        interventionQualityPassed: true,
        timingQualityPassed: true,
        attentionFatigueAcceptable: true,
        silenceQuality: {
          passed: true,
          silenceQualityScore: report.tripSilenceQuality,
        },
        l1UtilityPassed: true,
        l2UtilityPassed: true,
        longitudinal: report,
        userPreference: setUserProactivePreference({
          userId: 'u1',
          defaultLevel: 'L1_PASSIVE_ONLY',
        }),
      },
    });
    expect(notReady.passed).toBe(false);
    expect(notReady.dimensionPasses.userPreferenceAllowsPush).toBe(false);

    const ready = checkComprehensiveNotificationReadiness({
      scenarioId,
      dimensions: {
        temporalQualityPassed: true,
        decisionUtilityPassed: true,
        interventionQualityPassed: true,
        timingQualityPassed: true,
        attentionFatigueAcceptable: true,
        silenceQuality: {
          passed: true,
          silenceQualityScore: report.tripSilenceQuality,
        },
        l1UtilityPassed: true,
        l2UtilityPassed: true,
        longitudinal: report,
        userPreference: pref,
      },
    });
    expect(ready.passed).toBe(true);
    expect(ready.notificationPermissionIsNotNotificationAuthority).toBe(true);

    /** Readiness PASS 仍不可 Push，缺 Authority */
    let auth = createEmptyProactiveAuthorityRegistry();
    let push = authorizePushDelivery({
      readiness: ready,
      authority: auth,
      globalProactive: false,
    });
    expect(push.allowed).toBe(false);

    auth = grantProactiveAuthority({
      registry: auth,
      scenarioId,
      deliveryLevel: 'PUSH',
      grantedBy: 'scenario_review_board',
      reasonZh: 'pace 场景纵向可持续后授权 Push',
    });
    push = authorizePushDelivery({
      readiness: ready,
      authority: auth,
      globalProactive: false,
    });
    expect(push.allowed).toBe(true);
    expect(push.autoApplyClosed).toBe(true);
    expect(push.autoCancelClosed).toBe(true);
    expect(push.autoRerouteClosed).toBe(true);

    const autos = assertAutoActionsClosed();
    expect(autos.autoApply).toBe(false);
  });
});
