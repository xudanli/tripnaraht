import type { ProactiveReadinessGateV1 } from '../intervention-intelligence/proactive-readiness-gate.util';
import { freezeInterventionCandidate } from '../intervention-intelligence/intervention-candidate.util';
import {
  assertCandidateCannotAuthorizeChannel,
  selectSurfacePilotEntry,
} from './select-surface-pilot.util';
import { buildUserAttentionContext } from './user-attention-context.util';
import { decideDeliveryChannel } from './delivery-policy.util';
import {
  attemptL1PassiveSurface,
  evaluateL1SurfaceUtility,
  type L1SurfaceEvalEpisodeV1,
} from './l1-passive-surface.util';
import {
  admitL2InAppInterruptCanary,
  evaluateL2AttentionQuality,
  recordL2AttentionResponse,
} from './l2-in-app-interrupt-canary.util';
import {
  assertAutoActionsClosed,
  checkNotificationReadinessGate,
} from './notification-readiness-gate.util';
import { advanceProactiveSurfaceEvent } from './proactive-surface-event.util';

describe('Proactive Surface Pilot', () => {
  const scenarioId = 'pace_day_sequence' as const;

  function gate(pass: boolean): ProactiveReadinessGateV1 {
    return {
      schemaId: 'nara.proactive_readiness_gate@v1',
      version: 1,
      scenarioId,
      temporalQualityPassed: pass,
      decisionUtilityPassed: pass,
      interventionQualityPassed: pass,
      allowNotifyUser: false,
      notificationClosed: true,
      pushClosed: true,
      autoApplyClosed: true,
      autoActionClosed: true,
      usefulInformationIsNotWorthInterrupting: true,
      reasonsZh: [],
      dodFocusZh: '',
    };
  }

  function candidate(
    level: 'INTERRUPT_CANDIDATE' | 'SURFACE_PASSIVELY' | 'DO_NOT_SURFACE' = 'SURFACE_PASSIVELY',
  ) {
    if (level === 'DO_NOT_SURFACE') {
      return freezeInterventionCandidate({
        scenarioId,
        tripId: 't_psp',
        riskEventKey: 'pace_risk',
        severity: 0.2,
        urgency: 0.2,
        confidence: 0.2,
        actionability: 0.1,
        actionableLeadTimeHours: 0,
        disruptionCost: 0.9,
        candidateId: 'c_dns',
      });
    }
    if (level === 'INTERRUPT_CANDIDATE') {
      return freezeInterventionCandidate({
        scenarioId,
        tripId: 't_psp',
        riskEventKey: 'pace_risk',
        severity: 0.85,
        urgency: 0.8,
        confidence: 0.8,
        actionability: 0.75,
        actionableLeadTimeHours: 12,
        disruptionCost: 0.25,
        candidateId: 'c_int',
      });
    }
    return freezeInterventionCandidate({
      scenarioId,
      tripId: 't_psp',
      riskEventKey: 'pace_risk',
      severity: 0.55,
      urgency: 0.4,
      confidence: 0.7,
      actionability: 0.45,
      actionableLeadTimeHours: 10,
      disruptionCost: 0.45,
      candidateId: 'c_pas',
    });
  }

  it('Gate not PASS → CONTINUE_SHADOW; Interrupt ≠ Notification Auth', () => {
    const entry = selectSurfacePilotEntry({ gate: gate(false) });
    expect(entry.ok).toBe(false);
    if (!entry.ok) expect(entry.action).toBe('CONTINUE_SHADOW');

    const c = candidate('INTERRUPT_CANDIDATE');
    const denied = assertCandidateCannotAuthorizeChannel({
      candidate: c,
      requestedChannel: 'PUSH',
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe(
      'INTERRUPT_CANDIDATE_NOT_NOTIFICATION_AUTHORIZATION',
    );
  });

  it('L1 PASSIVE only on app open; driving/background stay silent', () => {
    const entry = selectSurfacePilotEntry({ gate: gate(true) });
    expect(entry.ok).toBe(true);
    const c = candidate('SURFACE_PASSIVELY');

    const driving = decideDeliveryChannel({
      entry,
      candidate: c,
      attention: buildUserAttentionContext({
        tripId: 't_psp',
        state: 'DRIVING',
        justOpenedApp: true,
      }),
    });
    expect(driving.staySilent).toBe(true);

    const bg = decideDeliveryChannel({
      entry,
      candidate: c,
      attention: buildUserAttentionContext({
        tripId: 't_psp',
        state: 'BACKGROUND',
      }),
    });
    expect(bg.channel).toBe('NONE');

    const open = attemptL1PassiveSurface({
      entry,
      candidate: c,
      attention: buildUserAttentionContext({
        tripId: 't_psp',
        state: 'APP_ACTIVE',
        justOpenedApp: true,
        attentionBudgetRemaining: 1,
      }),
      now: '2026-08-07T12:00:00.000Z',
    });
    expect(open.surfaced).toBe(true);
    expect(open.event.channel).toBe('L1_PASSIVE_IN_APP');
    expect(open.event.pushForbidden).toBe(true);

    const again = attemptL1PassiveSurface({
      entry,
      candidate: c,
      attention: buildUserAttentionContext({
        tripId: 't_psp',
        state: 'APP_ACTIVE',
        justOpenedApp: true,
      }),
      silenceState: open.silenceState,
      now: '2026-08-07T12:30:00.000Z',
    });
    expect(again.surfaced).toBe(false);
    expect(again.event.stayedSilent).toBe(true);
  });

  it('DoD: L1 utility proves appear/silence + outcome; L2 canary; Push still closed', () => {
    const entry = selectSurfacePilotEntry({ gate: gate(true) });
    expect(entry.ok).toBe(true);

    const episodes: L1SurfaceEvalEpisodeV1[] = [];
    for (let i = 0; i < 4; i++) {
      episodes.push({
        episodeId: `s_${i}`,
        scenarioId,
        surfaced: true,
        label: i === 3 ? 'IGNORED' : 'USEFUL_SURFACE',
        decisionImproved: true,
        actionImproved: true,
        outcomeImproved: true,
      });
    }
    for (let i = 0; i < 3; i++) {
      episodes.push({
        episodeId: `n_${i}`,
        scenarioId,
        surfaced: false,
        label: 'USEFUL_SURFACE',
        decisionImproved: i > 1,
        actionImproved: false,
        outcomeImproved: false,
      });
    }

    const l1 = evaluateL1SurfaceUtility({ scenarioId, episodes });
    expect(l1.ctrForbiddenAsPrimaryMetric).toBe(true);
    expect(l1.passed).toBe(true);
    expect(l1.allowL2Canary).toBe(true);
    expect(l1.outcomeImproveDelta).toBeGreaterThan(0);

    const c = candidate('INTERRUPT_CANDIDATE');
    const l2 = admitL2InAppInterruptCanary({
      entry,
      l1Utility: l1,
      candidate: c,
      attention: buildUserAttentionContext({
        tripId: 't_psp',
        state: 'APP_ACTIVE',
        justOpenedApp: false,
        attentionBudgetRemaining: 1,
      }),
      now: '2026-08-07T14:00:00.000Z',
    });
    expect(l2.ok).toBe(true);
    if (!l2.ok) return;

    let ev = advanceProactiveSurfaceEvent(l2.event, {
      viewedAt: '2026-08-07T14:00:05.000Z',
    });
    ev = recordL2AttentionResponse(ev, 'ACCEPT', '2026-08-07T14:00:10.000Z');
    ev = advanceProactiveSurfaceEvent(ev, {
      decidedAt: '2026-08-07T14:01:00.000Z',
      decisionId: 'dec_1',
      actedAt: '2026-08-07T14:02:00.000Z',
      actionId: 'act_1',
      outcomeAt: '2026-08-07T18:00:00.000Z',
      outcomeSummaryZh: '节奏调整后疲劳下降',
    });
    expect(ev.response).toBe('ACCEPT');
    expect(ev.outcomeSummaryZh).toBeTruthy();

    const events = [
      ev,
      recordL2AttentionResponse(
        createClone(l2.event, 'e2'),
        'SNOOZE',
      ),
      recordL2AttentionResponse(
        createClone(l2.event, 'e3'),
        'CONTINUE_ANYWAY',
      ),
    ];
    const aq = evaluateL2AttentionQuality({ events, minSamples: 3 });
    expect(aq.ctrForbiddenAsPrimaryMetric).toBe(true);
    expect(aq.passed).toBe(true);

    const nGate = checkNotificationReadinessGate({
      scenarioId,
      l1Utility: l1,
      l2Attention: aq,
    });
    expect(nGate.passed).toBe(false);
    expect(nGate.allowPush).toBe(false);
    expect(nGate.allowSystemNotification).toBe(false);

    const autos = assertAutoActionsClosed();
    expect(autos.autoApply).toBe(false);
    expect(autos.autoCancel).toBe(false);
    expect(autos.autoReroute).toBe(false);
  });
});

function createClone(
  base: import('./proactive-surface-event.util').ProactiveSurfaceEventV1,
  eventId: string,
) {
  return { ...base, eventId, response: undefined, respondedAt: undefined };
}
