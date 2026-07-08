/**
 * Agent ConstraintsEngine — narrate-only semantics when BLOCK/APPROVAL authority is delegated.
 */

import { isConstraintAgentBlockDelegated } from './constraint-plan-verify.config';

export type ConstraintSignalSnapshot = {
  violations: readonly { sev_level?: string }[];
  sev_level?: string;
  is_blocked?: boolean;
  requires_approval?: boolean;
  block_authority?: 'agent' | 'gateway';
  narrate_only?: boolean;
};

export function isConstraintAgentNarrateOnlyMode(): boolean {
  return isConstraintAgentBlockDelegated();
}

export function hasConstraintHardViolationSignal(
  result: Pick<ConstraintSignalSnapshot, 'violations' | 'sev_level'>,
): boolean {
  return result.violations.length > 0 || result.sev_level === 'SEV-1';
}

export function hasConstraintApprovalSignal(
  result: Pick<ConstraintSignalSnapshot, 'violations' | 'sev_level'>,
): boolean {
  return (
    result.sev_level === 'SEV-2' ||
    result.violations.some((v) => v.sev_level === 'SEV-2')
  );
}

/** Audit / red-team: detect hard signal without treating Agent is_blocked as authoritative */
export function resolveConstraintBlockedForAudit(result: ConstraintSignalSnapshot): boolean {
  if (result.narrate_only || result.block_authority === 'gateway') {
    return hasConstraintHardViolationSignal(result);
  }
  return Boolean(result.is_blocked);
}

export function resolveConstraintApprovalForAudit(result: ConstraintSignalSnapshot): boolean {
  if (result.narrate_only || result.block_authority === 'gateway') {
    return hasConstraintApprovalSignal(result);
  }
  return Boolean(result.requires_approval);
}
