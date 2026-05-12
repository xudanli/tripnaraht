/**
 * Product-layer enforcement: gates second Neptune pass + correction path using persisted ledger carry-forward flags.
 */

import type { TripWorldState } from '../decision/world-model';
import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import {
  resolveCorrectionStrategy,
  type EcoCorrectionStrategy,
} from '../execution-convergence-optimizer/minimal-correction-engine';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';

export function gateEcoClosureSecondPass(input: {
  priorLedger?: EcoIdentityLedgerSnapshot;
  baseAllowRetry: boolean;
  enforcementDisabled?: boolean;
}): boolean {
  if (!input.baseAllowRetry) return false;
  if (input.enforcementDisabled) return true;
  const p = input.priorLedger;
  if (!p) return true;
  if (p.carryForwardMetaFreeze) return false;
  if (p.carryForwardRecursiveFreeze) return false;
  return true;
}

/** Prefer full Neptune duplicate repair when prior tick signaled rollback bias. */
export function resolveCorrectionStrategyWithLedger(
  state: TripWorldState,
  priorLedger: EcoIdentityLedgerSnapshot | undefined,
  enforcementDisabled?: boolean,
): EcoCorrectionStrategy {
  const base = resolveCorrectionStrategy(state);
  if (enforcementDisabled) return base;
  if (priorLedger?.carryForwardSuggestRollback && base === 'minimal_patch_then_neptune') {
    return 'full_neptune_retry';
  }
  return base;
}

export function isEcoClosureEnforcementDisabled(policy?: EcoClosurePolicy | null): boolean {
  if (policy?.disableEcoClosureEnforcement === true) return true;
  if (typeof process !== 'undefined' && process.env?.TRIP_ECO_DISABLE_ENFORCEMENT === '1') {
    return true;
  }
  return false;
}
