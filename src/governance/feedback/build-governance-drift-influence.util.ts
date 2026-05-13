import type { GovernanceDriftSignal, GovernanceRecoveryQualityScore } from '../drift/governance-drift.types';
import type { GovernanceDriftInfluence } from './governance-drift-influence.types';

/**
 * Maps GDRES assessment → raw influence vectors (pre-gate).
 */
export function buildGovernanceDriftInfluencesFromAssessment(args: {
  signals: readonly GovernanceDriftSignal[];
  recoveryQuality: GovernanceRecoveryQualityScore;
}): GovernanceDriftInfluence[] {
  const out: GovernanceDriftInfluence[] = [];
  const recurring = args.signals.filter((s) => s.type === 'recurring_block');
  if (recurring.length) {
    const c = Math.max(...recurring.map((s) => s.confidence));
    out.push({
      target: 'search_constraints',
      suggestedDelta: Math.min(0.12, 0.04 + 0.08 * c),
      confidence: c,
      driftReasonCodes: uniq(recurring.flatMap((s) => s.driftReasonCodes)).slice(0, 12),
    });
  }
  const worldReg = args.signals.filter((s) => s.type === 'world_regression');
  if (worldReg.length) {
    const c = Math.max(...worldReg.map((s) => s.confidence));
    out.push({
      target: 'activation_thresholds',
      suggestedDelta: Math.min(0.1, 0.03 + 0.06 * c),
      confidence: c,
      driftReasonCodes: uniq(worldReg.flatMap((s) => s.driftReasonCodes)).slice(0, 12),
    });
  }
  const pol = args.signals.filter((s) => s.type === 'policy_insufficient');
  if (pol.length) {
    const c = Math.max(...pol.map((s) => s.confidence));
    out.push({
      target: 'search_constraints',
      suggestedDelta: Math.min(0.1, 0.03 + 0.05 * c),
      confidence: c,
      driftReasonCodes: uniq(pol.flatMap((s) => s.driftReasonCodes)).slice(0, 12),
    });
  }
  if (args.recoveryQuality.score < 0.58) {
    const deficit = 0.58 - args.recoveryQuality.score;
    out.push({
      target: 'planner_weights',
      suggestedDelta: -Math.min(0.1, 0.04 + 0.2 * deficit),
      confidence: Math.min(0.88, 0.5 + deficit),
      driftReasonCodes: [
        'gfil.rqi_low',
        `gfil.recovery_cycles.${args.recoveryQuality.recoveryCycleCount}`,
        `gfil.recurrence.${args.recoveryQuality.recurrenceCount}`,
      ],
    });
  }
  return mergeInfluencesByTarget(out);
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

function mergeInfluencesByTarget(rows: GovernanceDriftInfluence[]): GovernanceDriftInfluence[] {
  const m = new Map<GovernanceDriftInfluence['target'], GovernanceDriftInfluence>();
  for (const r of rows) {
    const prev = m.get(r.target);
    if (!prev) {
      m.set(r.target, { ...r, driftReasonCodes: [...r.driftReasonCodes] });
      continue;
    }
    const delta =
      Math.abs(r.suggestedDelta) > Math.abs(prev.suggestedDelta) ? r.suggestedDelta : prev.suggestedDelta;
    m.set(r.target, {
      target: r.target,
      suggestedDelta: delta,
      confidence: Math.max(prev.confidence, r.confidence),
      driftReasonCodes: uniq([...prev.driftReasonCodes, ...r.driftReasonCodes]).slice(0, 20),
    });
  }
  return [...m.values()];
}
