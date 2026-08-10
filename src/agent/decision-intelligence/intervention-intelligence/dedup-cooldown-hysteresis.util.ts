/**
 * Dedup / Cooldown / Hysteresis — 避免同一风险状态反复产生 Candidate。
 */

import type { InterventionCandidateV1 } from './intervention-candidate.util';

export const INTERVENTION_DEDUP_STATE_SCHEMA =
  'nara.intervention_dedup_state@v1' as const;

export type InterventionDedupStateV1 = {
  schemaId: typeof INTERVENTION_DEDUP_STATE_SCHEMA;
  version: 1;
  tripId: string;
  riskEventKey: string;
  lastCandidateId?: string;
  lastSurfaceLevel?: InterventionCandidateV1['surfaceLevel'];
  lastEmittedAt?: string;
  suppressUntil?: string;
  /** 滞回：升/降级门槛分离 */
  hysteresisHigh: number;
  hysteresisLow: number;
  lastInterruptScore?: number;
};

export function createInterventionDedupState(input: {
  tripId: string;
  riskEventKey: string;
  hysteresisHigh?: number;
  hysteresisLow?: number;
}): InterventionDedupStateV1 {
  const high = input.hysteresisHigh ?? 0.38;
  const low = input.hysteresisLow ?? 0.28;
  if (low >= high) {
    throw new Error('[Dedup] hysteresisLow_must_be_lt_high');
  }
  return {
    schemaId: INTERVENTION_DEDUP_STATE_SCHEMA,
    version: 1,
    tripId: input.tripId,
    riskEventKey: input.riskEventKey,
    hysteresisHigh: high,
    hysteresisLow: low,
  };
}

export type AdmitCandidateResult =
  | {
      ok: true;
      reason: 'ADMIT';
      nextState: InterventionDedupStateV1;
    }
  | {
      ok: false;
      reason: 'DEDUP' | 'COOLDOWN' | 'HYSTERESIS';
      reasonZh: string;
      nextState: InterventionDedupStateV1;
    };

function interruptScore(c: InterventionCandidateV1): number {
  return (
    c.severity * 0.22 +
    c.urgency * 0.22 +
    c.actionability * 0.22 +
    c.confidence * 0.14 +
    Math.min(1, c.actionableLeadTimeHours / 24) * 0.1 -
    c.disruptionCost * 0.4
  );
}

/**
 * 同一 riskEventKey：冷却期内不重复；滞回防止边界抖动反复升/降级。
 */
export function admitInterventionCandidate(input: {
  state: InterventionDedupStateV1;
  candidate: InterventionCandidateV1;
  now?: string;
  cooldownHours?: number;
}): AdmitCandidateResult {
  if (
    input.candidate.tripId !== input.state.tripId ||
    input.candidate.riskEventKey !== input.state.riskEventKey
  ) {
    throw new Error('[Dedup] trip_or_riskEventKey_mismatch');
  }

  const now = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const cooldownHours = input.cooldownHours ?? 6;
  const score = interruptScore(input.candidate);
  let next: InterventionDedupStateV1 = { ...input.state };

  if (input.state.suppressUntil) {
    const until = Date.parse(input.state.suppressUntil);
    if (!Number.isNaN(until) && nowMs < until) {
      return {
        ok: false,
        reason: 'COOLDOWN',
        reasonZh: `冷却中至 ${input.state.suppressUntil}，避免反复 Candidate`,
        nextState: next,
      };
    }
  }

  if (
    input.state.lastSurfaceLevel === input.candidate.surfaceLevel &&
    input.state.lastEmittedAt
  ) {
    const lastMs = Date.parse(input.state.lastEmittedAt);
    if (
      !Number.isNaN(lastMs) &&
      nowMs - lastMs < cooldownHours * 3600_000
    ) {
      return {
        ok: false,
        reason: 'DEDUP',
        reasonZh: `同风险同 surfaceLevel 在 ${cooldownHours}h 内已发出，去重`,
        nextState: next,
      };
    }
  }

  /** 滞回：若上次已是 INTERRUPT，需降到 low 以下才允许降级记录；未达 high 不得升级 */
  const prev = input.state.lastInterruptScore;
  if (
    input.candidate.surfaceLevel === 'INTERRUPT_CANDIDATE' &&
    prev != null &&
    prev < input.state.hysteresisHigh &&
    score < input.state.hysteresisHigh &&
    input.state.lastSurfaceLevel !== 'INTERRUPT_CANDIDATE'
  ) {
    return {
      ok: false,
      reason: 'HYSTERESIS',
      reasonZh: `滞回：score ${score.toFixed(2)} 未跨过 high=${input.state.hysteresisHigh}`,
      nextState: next,
    };
  }

  if (
    input.state.lastSurfaceLevel === 'INTERRUPT_CANDIDATE' &&
    input.candidate.surfaceLevel !== 'INTERRUPT_CANDIDATE' &&
    score > input.state.hysteresisLow
  ) {
    return {
      ok: false,
      reason: 'HYSTERESIS',
      reasonZh: `滞回：仍高于 low=${input.state.hysteresisLow}，抑制反复降级抖动`,
      nextState: next,
    };
  }

  next = {
    ...next,
    lastCandidateId: input.candidate.candidateId,
    lastSurfaceLevel: input.candidate.surfaceLevel,
    lastEmittedAt: now,
    lastInterruptScore: score,
    suppressUntil: new Date(nowMs + cooldownHours * 3600_000).toISOString(),
  };

  return { ok: true, reason: 'ADMIT', nextState: next };
}
