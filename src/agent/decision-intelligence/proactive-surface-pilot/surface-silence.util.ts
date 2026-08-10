/**
 * Suppression / Dedup / Cooldown / Attention Budget —
 * 主动智能必须能明确决定「保持沉默」。
 */

import type { InterventionCandidateV1 } from '../intervention-intelligence/intervention-candidate.util';
import type { UserAttentionContextV1 } from './user-attention-context.util';
import type { DeliveryDecisionV1 } from './delivery-policy.util';

export const SURFACE_SILENCE_STATE_SCHEMA =
  'nara.surface_silence_state@v1' as const;

export type SurfaceSilenceStateV1 = {
  schemaId: typeof SURFACE_SILENCE_STATE_SCHEMA;
  version: 1;
  tripId: string;
  riskEventKey: string;
  lastSurfacedAt?: string;
  suppressUntil?: string;
  surfacesInWindow: number;
  attentionBudgetSpent: number;
};

export function createSurfaceSilenceState(input: {
  tripId: string;
  riskEventKey: string;
}): SurfaceSilenceStateV1 {
  return {
    schemaId: SURFACE_SILENCE_STATE_SCHEMA,
    version: 1,
    tripId: input.tripId,
    riskEventKey: input.riskEventKey,
    surfacesInWindow: 0,
    attentionBudgetSpent: 0,
  };
}

export type SilenceDecisionV1 =
  | {
      staySilent: true;
      reason:
        | 'SUPPRESSION'
        | 'DEDUP'
        | 'COOLDOWN'
        | 'ATTENTION_BUDGET'
        | 'DELIVERY_SILENT'
        | 'CANDIDATE_DO_NOT_SURFACE';
      reasonZh: string;
      nextState: SurfaceSilenceStateV1;
    }
  | {
      staySilent: false;
      reason: 'ALLOW_SURFACE';
      reasonZh: string;
      nextState: SurfaceSilenceStateV1;
    };

/**
 * 在 Delivery 授权之上再施加沉默策略；可覆盖为保持沉默。
 */
export function decideStaySilent(input: {
  state: SurfaceSilenceStateV1;
  candidate: InterventionCandidateV1;
  attention: UserAttentionContextV1;
  delivery: DeliveryDecisionV1;
  now?: string;
  cooldownHours?: number;
  maxSurfacesPerWindow?: number;
  maxAttentionSpend?: number;
}): SilenceDecisionV1 {
  const now = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const cooldownHours = input.cooldownHours ?? 8;
  const maxSurf = input.maxSurfacesPerWindow ?? 2;
  const maxSpend = input.maxAttentionSpend ?? 0.6;
  let next = { ...input.state };

  if (input.candidate.surfaceLevel === 'DO_NOT_SURFACE') {
    return {
      staySilent: true,
      reason: 'CANDIDATE_DO_NOT_SURFACE',
      reasonZh: 'Candidate 为 DO_NOT_SURFACE → 保持沉默',
      nextState: next,
    };
  }

  if (input.delivery.staySilent || !input.delivery.authorized) {
    return {
      staySilent: true,
      reason: 'DELIVERY_SILENT',
      reasonZh: input.delivery.reasonZh,
      nextState: next,
    };
  }

  if (input.state.suppressUntil) {
    const until = Date.parse(input.state.suppressUntil);
    if (!Number.isNaN(until) && nowMs < until) {
      return {
        staySilent: true,
        reason: 'SUPPRESSION',
        reasonZh: `Suppression 至 ${input.state.suppressUntil}`,
        nextState: next,
      };
    }
  }

  if (
    input.state.lastSurfacedAt &&
    !Number.isNaN(Date.parse(input.state.lastSurfacedAt)) &&
    nowMs - Date.parse(input.state.lastSurfacedAt) < cooldownHours * 3600_000
  ) {
    return {
      staySilent: true,
      reason: 'COOLDOWN',
      reasonZh: `Cooldown ${cooldownHours}h 内已 Surface → 保持沉默`,
      nextState: next,
    };
  }

  if (input.state.surfacesInWindow >= maxSurf) {
    return {
      staySilent: true,
      reason: 'DEDUP',
      reasonZh: `窗口内 Surface 次数 ${input.state.surfacesInWindow} ≥ ${maxSurf}`,
      nextState: next,
    };
  }

  const spendNext =
    input.state.attentionBudgetSpent +
    (input.delivery.channel === 'L2_IN_APP_INTERRUPT' ? 0.35 : 0.15);
  if (
    input.attention.attentionBudgetRemaining <= 0.05 ||
    spendNext > maxSpend
  ) {
    return {
      staySilent: true,
      reason: 'ATTENTION_BUDGET',
      reasonZh: 'Attention Budget 不足 → 主动智能选择保持沉默',
      nextState: next,
    };
  }

  next = {
    ...next,
    lastSurfacedAt: now,
    surfacesInWindow: next.surfacesInWindow + 1,
    attentionBudgetSpent: spendNext,
    suppressUntil: new Date(nowMs + cooldownHours * 3600_000).toISOString(),
  };

  return {
    staySilent: false,
    reason: 'ALLOW_SURFACE',
    reasonZh: `允许 ${input.delivery.channel} Surface`,
    nextState: next,
  };
}
