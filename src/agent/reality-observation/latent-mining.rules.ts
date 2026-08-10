/**
 * P0 Latent 挖掘：节奏 / 驾驶容忍 / 早起 — 全部 CANDIDATE，不入 Canonical。
 */

import type { ObservationExecutionState } from './observation-executor';
import type { LatentHypothesis } from './reality-observation.types';

function nowIso(): string {
  return new Date().toISOString();
}

function pick(
  state: ObservationExecutionState,
  key: string,
): unknown {
  return (
    state.observedFacts.find((f) => f.key === key)?.value ??
    state.derivedFacts.find((d) => d.key === key)?.value
  );
}

export function mineLatentHypothesesFromSignals(input: {
  message: string;
  state: ObservationExecutionState;
}): LatentHypothesis[] {
  const at = nowIso();
  const out: LatentHypothesis[] = [];
  const msg = input.message ?? '';
  const density = pick(input.state, 'derived.day.scheduleDensity');
  const driving = pick(input.state, 'derived.day.totalDrivingMinutes');
  const buffer = pick(input.state, 'derived.day.bufferMinutes');

  if (/轻松|太累|太赶|别排那么满|密度太高/i.test(msg) || density === 'HIGH') {
    out.push({
      id: `lat_pace_${Date.now()}`,
      key: 'trip.currentPaceMismatch',
      value: 'TOO_DENSE',
      scope: 'TRIP',
      evidenceRefs: [
        'message',
        ...(density === 'HIGH' ? ['derived.day.scheduleDensity'] : []),
      ],
      supportingEvidenceCount: density === 'HIGH' ? 2 : 1,
      contradictingEvidenceCount: 0,
      confidence: density === 'HIGH' ? 0.88 : 0.72,
      generatedBy: 'RULE',
      validFrom: at,
      usagePolicy: 'SOFT_CONSTRAINT',
      status: 'CANDIDATE',
      allowLongTermPromotion: false,
    });
  }

  if (/轻松|太累/i.test(msg)) {
    out.push({
      id: `lat_fatigue_${Date.now()}`,
      key: 'user.currentFatigue',
      value: 'ELEVATED',
      scope: 'DAY',
      evidenceRefs: ['message'],
      supportingEvidenceCount: 1,
      contradictingEvidenceCount: 0,
      confidence: 0.65,
      generatedBy: 'RULE',
      validFrom: at,
      validUntil: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
      usagePolicy: 'RANKING_ONLY',
      status: 'CANDIDATE',
      allowLongTermPromotion: false,
    });
  }

  if (/不想早起|别太早|晚一点出发|不要.*早上\s*0?7/i.test(msg)) {
    out.push({
      id: `lat_early_${Date.now()}`,
      key: 'user.earlyStartTolerance',
      value: 'LOW',
      scope: 'TRIP',
      evidenceRefs: ['message'],
      supportingEvidenceCount: 1,
      contradictingEvidenceCount: 0,
      confidence: 0.7,
      generatedBy: 'RULE',
      validFrom: at,
      usagePolicy: 'RANKING_ONLY',
      status: 'CANDIDATE',
      allowLongTermPromotion: false,
    });
  }

  if (typeof driving === 'number' && driving >= 270) {
    out.push({
      id: `lat_drive_${Date.now()}`,
      key: 'user.maxDailyDrivingTolerance',
      value: {
        preferred: 210,
        acceptable: 270,
        likelyRejectAbove: 330,
        observedMinutes: driving,
      },
      scope: 'TRIP',
      evidenceRefs: ['derived.day.totalDrivingMinutes'],
      supportingEvidenceCount: 1,
      contradictingEvidenceCount: 0,
      confidence: driving >= 330 ? 0.8 : 0.62,
      generatedBy: 'RULE',
      validFrom: at,
      usagePolicy: 'RANKING_ONLY',
      status: 'CANDIDATE',
      allowLongTermPromotion: false,
    });
  }

  if (typeof buffer === 'number' && buffer < 30 && density === 'HIGH') {
    out.push({
      id: `lat_buffer_${Date.now()}`,
      key: 'trip.dayBufferStress',
      value: 'CRITICAL',
      scope: 'DAY',
      evidenceRefs: ['derived.day.bufferMinutes', 'derived.day.scheduleDensity'],
      supportingEvidenceCount: 2,
      contradictingEvidenceCount: 0,
      confidence: 0.86,
      generatedBy: 'RULE',
      validFrom: at,
      validUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      usagePolicy: 'SOFT_CONSTRAINT',
      status: 'CANDIDATE',
      allowLongTermPromotion: false,
    });
  }

  if (/愿意删|可以去掉|少去一个|取消一个/i.test(msg)) {
    out.push({
      id: `lat_removal_${Date.now()}`,
      key: 'user.changeTolerance',
      value: 'ALLOW_ACTIVITY_REMOVAL',
      scope: 'TRIP',
      evidenceRefs: ['message'],
      supportingEvidenceCount: 1,
      contradictingEvidenceCount: 0,
      confidence: 0.55,
      generatedBy: 'RULE',
      validFrom: at,
      usagePolicy: 'CONFIRM_REQUIRED',
      status: 'CANDIDATE',
      allowLongTermPromotion: false,
    });
  }

  return out;
}
