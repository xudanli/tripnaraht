/**
 * P2 — ECPS-aware unified scheduler tick plan (replaces pure stub ordering).
 */

import type { UnifiedSchedulerTickInput, UnifiedSchedulerTickPlan } from './unified-scheduler.types';
import { UNIFIED_SCHEDULER_SCHEMA } from './unified-scheduler.types';

function dedupeConsecutive<T>(arr: T[]): T[] {
  const out: T[] = [];
  for (const x of arr) {
    if (out.length === 0 || out[out.length - 1] !== x) out.push(x);
  }
  return out;
}

export function planUnifiedSchedulerTick(input: UnifiedSchedulerTickInput): UnifiedSchedulerTickPlan {
  const d = input.ecpsDecision;
  const phases: UnifiedSchedulerTickPlan['phases'] = ['ROUTE'];

  if (d) {
    const evolve = d.mode === 'RECOMPUTE' || d.mode === 'VALIDATE';
    const shadow =
      evolve || d.invalidationScope === 'PARTIAL' || d.invalidationScope === 'FULL';
    if (evolve) phases.push('EVOLVE_PHI');
    if (shadow) phases.push('SHADOW');
    const needSpcl =
      !!input.spclCollapseRequested ||
      d.invalidationScope !== 'NONE' ||
      d.mode === 'RECOMPUTE';
    if (needSpcl) phases.push('SPCL');
  } else {
    phases.push('EVOLVE_PHI', 'SHADOW', 'SPCL');
  }

  phases.push('PERSIST');
  if (input.replayEligible) {
    phases.push('REPLAY_VERIFY');
  }

  const phasesOut = dedupeConsecutive(phases);

  const notes: string[] = [];
  if (input.spclCollapseRequested) notes.push('SPCL_COLLAPSE_REQUESTED');
  if (input.replayEligible) notes.push('REPLAY_ELIGIBLE');
  if (d) {
    notes.push(`ECPS_MODE:${d.mode}`);
    notes.push(`INVALIDATION:${d.invalidationScope}`);
    notes.push(`KERNEL:${d.kernel}`);
  }
  if (input.operatorFamilyHint) notes.push(`OPERATOR_HINT:${input.operatorFamilyHint}`);

  const runSpclCollapse =
    !!input.spclCollapseRequested ||
    (!!d && (d.invalidationScope !== 'NONE' || d.mode === 'RECOMPUTE'));

  return {
    schema: UNIFIED_SCHEDULER_SCHEMA,
    queryId: input.queryId,
    phases: phasesOut,
    runReplayVerification: !!input.replayEligible,
    runSpclCollapse,
    notes,
  };
}
