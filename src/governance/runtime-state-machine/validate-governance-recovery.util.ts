import type { GovernanceRecoveryValidation, GovernanceRecoveryValidationInput } from './governance-recovery-validation.types';

function hasHaltStyleRestriction(restrictions: readonly string[]): boolean {
  return restrictions.some((r) => r === 'halt_automated_execution' || r.startsWith('halt_'));
}

/**
 * RVL v1: structural checks only (corridor ban list + world hints + halt restrictions).
 * Callers may tighten with external validators before invoking RCC.
 */
export function validateGovernanceRecovery(input: GovernanceRecoveryValidationInput): GovernanceRecoveryValidation {
  const remainingRisks: string[] = [];
  const unresolvedConstraints: string[] = [];

  const banned = new Set((input.bannedCorridorRefs ?? []).map(String));
  for (const day of input.itineraryDays ?? []) {
    for (const it of day.items ?? []) {
      const ref = it.metadata?.route_segment_ref;
      if (ref != null && banned.has(String(ref))) {
        remainingRisks.push(`corridor_ref_blocked:${ref}`);
      }
    }
  }
  for (const r of input.activeWorldRiskHints ?? []) {
    if (String(r).trim()) remainingRisks.push(`world_risk:${r}`);
  }
  const restrictions = input.snapshotActiveRestrictions ?? [];
  for (const r of restrictions) {
    unresolvedConstraints.push(`restriction:${r}`);
  }

  let recommendedRuntimeState: GovernanceRecoveryValidation['recommendedRuntimeState'] = 'NORMAL';
  if (remainingRisks.length > 0) {
    recommendedRuntimeState = 'RECOVERING';
  } else if (hasHaltStyleRestriction(restrictions)) {
    recommendedRuntimeState = 'RESTRICTED';
  }

  const valid = remainingRisks.length === 0 && recommendedRuntimeState === 'NORMAL';

  return {
    valid,
    remainingRisks,
    unresolvedConstraints,
    recommendedRuntimeState,
  };
}
