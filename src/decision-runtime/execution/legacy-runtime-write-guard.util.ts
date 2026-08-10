/**
 * Legacy runtime must not silently write Effective Plan / itinerary.
 * Authority Consistency Priority 2 — live path soft-gates live in
 * `legacy-mutation-commit.adapter` / `agentic-mutation-commit.adapter`;
 * throw helpers remain for direct write call sites and contract tests.
 */

import { BadRequestException } from '@nestjs/common';
import {
  normalizeDecisionRuntimeMode,
  resolveDecisionRuntimeMode,
} from '../constraints/constraint-evaluation.config';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
} from './effective-plan-write-chain-blocked.util';

export const LEGACY_SILENT_WRITE_BLOCKED_CODE = 'LEGACY_SILENT_WRITE_BLOCKED' as const;

export type LegacySilentWriteGateInput = {
  /** True when executing routeAndRunLegacy / Legacy fallback commit. */
  forceLegacyPath?: boolean;
};

/**
 * Block silent writes when DECISION_RUNTIME_MODE=LEGACY, or when the caller
 * is on the Legacy fallback path (熔断落到 LEGACY).
 */
export function shouldBlockLegacySilentWrite(
  opts?: LegacySilentWriteGateInput,
): boolean {
  if (opts?.forceLegacyPath) return true;
  const mode = normalizeDecisionRuntimeMode(resolveDecisionRuntimeMode());
  return mode === 'LEGACY';
}

/**
 * When Decision Runtime is LEGACY (or forceLegacyPath), plan mutation must not
 * proceed as a silent write — caller must escalate to NEED_CONFIRMATION /
 * Decision Problem. Prefer soft-gate adapters for route_and_run responses.
 */
export function assertLegacyRuntimeMustNotSilentWrite(
  caller: string,
  opts?: LegacySilentWriteGateInput,
): void {
  if (!shouldBlockLegacySilentWrite(opts)) return;
  throw new BadRequestException({
    code: LEGACY_SILENT_WRITE_BLOCKED_CODE,
    error: LEGACY_SILENT_WRITE_BLOCKED_CODE,
    message:
      `Legacy runtime cannot silently write plan (${caller}). ` +
      `Escalate to Decision Problem → Gateway → Preview → Confirm → Apply.`,
    caller,
    authorizedPaths: EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
    relatedCode: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  });
}

export function agenticMutationMissingDecisionId(input: {
  decisionId?: string | null;
  mutatesPlan: boolean;
}): boolean {
  if (!input.mutatesPlan) return false;
  return !(input.decisionId && String(input.decisionId).trim());
}

/**
 * Agentic Fast Path / tool loop: refuse plan-mutating tools without a Decision ID.
 */
export function assertAgenticMutationRequiresDecisionId(input: {
  caller: string;
  decisionId?: string | null;
  mutatesPlan: boolean;
}): void {
  if (!agenticMutationMissingDecisionId(input)) return;
  throw new BadRequestException({
    code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    message:
      `Agentic Fast Path refuses plan mutation without Decision ID (${input.caller}). ` +
      `Open Decision Problem / UWC Preview→Confirm→Apply.`,
    caller: input.caller,
    authorizedPaths: EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  });
}
