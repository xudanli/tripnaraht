import type { MemoryLedgerPhaseV1 } from '../memory/decision-ledger/world-topic-slice.types';

/**
 * route_and_run 内决策账本增量调解（reconcile）的相位策略。
 * PLANNING：仅 advisory；GATE_EVAL / EXECUTION：阻塞式 reconcile，失败可按 ABORT_ON_ESCALATION 中断主编排。
 */
export const LEDGER_RECONCILE_POLICY = {
  BLOCKING_PHASES: ['GATE_EVAL', 'EXECUTION'] as const satisfies readonly MemoryLedgerPhaseV1[],
  MAX_RETRIES: 2,
  ABORT_ON_ESCALATION: true,
} as const;

export function isLedgerReconcileBlockingPhase(phase: MemoryLedgerPhaseV1): boolean {
  return (LEDGER_RECONCILE_POLICY.BLOCKING_PHASES as readonly string[]).includes(phase);
}

/** Robustness Rollout — physical + organizational simulation on successful planning responses. */
export const ROBUSTNESS_ROLLOUT_POLICY = {
  maxSampleCount: 100,
  minItineraryItems: 1,
  organizationalStressThreshold: 0.72,
  defaultPerturbations: ['WEATHER', 'TRANSPORT', 'FATIGUE', 'SOCIAL'] as const,
} as const;

export function isRobustnessRolloutEnabled(): boolean {
  return process.env.ROBUSTNESS_ROLLOUT_ENABLED !== '0';
}

export function robustnessRolloutDefaultSampleCount(): number {
  const n = Number(process.env.ROBUSTNESS_ROLLOUT_SAMPLES ?? 50);
  return Number.isFinite(n) && n > 0 ? n : 50;
}
