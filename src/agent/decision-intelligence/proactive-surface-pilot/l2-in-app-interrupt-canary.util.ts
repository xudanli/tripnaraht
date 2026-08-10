/**
 * L2 IN_APP_INTERRUPT Canary — Accept / Dismiss / Snooze / Continue Anyway。
 * 仅 L1 Utility 通过后小范围开放；Push 仍关。
 */

import type { InterventionCandidateV1 } from '../intervention-intelligence/intervention-candidate.util';
import type { UserAttentionContextV1 } from './user-attention-context.util';
import type { SelectSurfacePilotResult } from './select-surface-pilot.util';
import type { L1SurfaceUtilityReportV1 } from './l1-passive-surface.util';
import { decideDeliveryChannel } from './delivery-policy.util';
import {
  createProactiveSurfaceEvent,
  advanceProactiveSurfaceEvent,
  type L2UserResponseV1,
  type ProactiveSurfaceEventV1,
} from './proactive-surface-event.util';
import {
  createSurfaceSilenceState,
  decideStaySilent,
} from './surface-silence.util';

export type L2CanaryAdmitResult =
  | { ok: true; event: ProactiveSurfaceEventV1 }
  | {
      ok: false;
      code: 'L1_UTILITY_NOT_PASSED' | 'STAY_SILENT' | 'CHANNEL_NOT_L2';
      reasonZh: string;
    };

export function admitL2InAppInterruptCanary(input: {
  entry: SelectSurfacePilotResult;
  l1Utility: L1SurfaceUtilityReportV1;
  candidate: InterventionCandidateV1;
  attention: UserAttentionContextV1;
  now?: string;
}): L2CanaryAdmitResult {
  if (!input.l1Utility.passed || !input.l1Utility.allowL2Canary) {
    return {
      ok: false,
      code: 'L1_UTILITY_NOT_PASSED',
      reasonZh: 'L1 Utility 未通过 → 禁止 L2 IN_APP_INTERRUPT Canary',
    };
  }

  const delivery = decideDeliveryChannel({
    entry: input.entry,
    candidate: input.candidate,
    attention: input.attention,
    l1UtilityPassed: true,
    notificationReadinessPassed: false,
  });

  const silence = decideStaySilent({
    state: createSurfaceSilenceState({
      tripId: input.candidate.tripId,
      riskEventKey: input.candidate.riskEventKey,
    }),
    candidate: input.candidate,
    attention: input.attention,
    delivery,
    now: input.now,
  });

  if (silence.staySilent) {
    return {
      ok: false,
      code: 'STAY_SILENT',
      reasonZh: silence.reasonZh,
    };
  }
  if (delivery.channel !== 'L2_IN_APP_INTERRUPT') {
    return {
      ok: false,
      code: 'CHANNEL_NOT_L2',
      reasonZh: `Delivery Policy 未授权 L2（channel=${delivery.channel}）`,
    };
  }

  return {
    ok: true,
    event: createProactiveSurfaceEvent({
      scenarioId: input.candidate.scenarioId,
      tripId: input.candidate.tripId,
      candidateId: input.candidate.candidateId,
      channel: 'L2_IN_APP_INTERRUPT',
      surfacedAt: input.now,
    }),
  };
}

export function recordL2AttentionResponse(
  event: ProactiveSurfaceEventV1,
  response: Exclude<L2UserResponseV1, 'NONE'>,
  at?: string,
): ProactiveSurfaceEventV1 {
  const ts = at ?? new Date().toISOString();
  return advanceProactiveSurfaceEvent(event, {
    viewedAt: event.viewedAt ?? ts,
    respondedAt: ts,
    response,
  });
}

export type AttentionQualityReportV1 = {
  n: number;
  acceptRate: number;
  dismissRate: number;
  snoozeRate: number;
  continueAnywayRate: number;
  /** Attention Quality：非 CTR */
  attentionQualityScore: number;
  passed: boolean;
  reasonsZh: string[];
  ctrForbiddenAsPrimaryMetric: true;
};

export function evaluateL2AttentionQuality(input: {
  events: ProactiveSurfaceEventV1[];
  minSamples?: number;
  maxDismissRate?: number;
  minAttentionQuality?: number;
}): AttentionQualityReportV1 {
  const minN = input.minSamples ?? 3;
  const rows = input.events.filter(
    (e) => e.channel === 'L2_IN_APP_INTERRUPT' && !e.stayedSilent && e.response,
  );
  const n = rows.length;
  const rate = (r: L2UserResponseV1) =>
    n === 0 ? 0 : rows.filter((e) => e.response === r).length / n;

  const acceptRate = rate('ACCEPT');
  const dismissRate = rate('DISMISS');
  const snoozeRate = rate('SNOOZE');
  const continueAnywayRate = rate('CONTINUE_ANYWAY');

  const attentionQualityScore = Math.max(
    0,
    Math.min(
      1,
      acceptRate * 0.5 +
        snoozeRate * 0.2 +
        continueAnywayRate * 0.1 -
        dismissRate * 0.4 +
        0.4,
    ),
  );

  const reasonsZh: string[] = [];
  if (n < minN) reasonsZh.push(`L2 样本不足 ${n} < ${minN}`);
  if (dismissRate > (input.maxDismissRate ?? 0.5)) {
    reasonsZh.push(`Dismiss 过高 ${dismissRate.toFixed(2)}（打扰过度）`);
  }
  if (attentionQualityScore < (input.minAttentionQuality ?? 0.45)) {
    reasonsZh.push(
      `Attention Quality ${attentionQualityScore.toFixed(2)} 不足`,
    );
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push('L2 Attention Quality 可接受（Accept/Dismiss/Snooze/Continue Anyway 对账）');
  }

  return {
    n,
    acceptRate,
    dismissRate,
    snoozeRate,
    continueAnywayRate,
    attentionQualityScore,
    passed,
    reasonsZh,
    ctrForbiddenAsPrimaryMetric: true,
  };
}
