/**
 * TEP artifacts persisted on PlanVersion.metadata.tep
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 C.3
 */

import type { DecisionHook, RecoveryGraph } from './tep-self-drive.types';

export const TEP_PLAN_VERSION_METADATA_SCHEMA =
  'tripnara/tep_plan_version_metadata@v1' as const;

export interface TepPlanVersionMetadata {
  schemaId: typeof TEP_PLAN_VERSION_METADATA_SCHEMA;
  decisionHooks: DecisionHook[];
  recoveryGraph?: RecoveryGraph;
  /** Last accepted RecoveryOption.optionId (Local Repair writeback) */
  recoveryGraphApplied?: string;
  syncedAt: string;
}

export function isTepPlanVersionMetadata(value: unknown): value is TepPlanVersionMetadata {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.schemaId === TEP_PLAN_VERSION_METADATA_SCHEMA &&
    Array.isArray(row.decisionHooks)
  );
}

export function readTepPlanVersionMetadata(
  metadata: Record<string, unknown> | undefined,
): TepPlanVersionMetadata | undefined {
  const tep = metadata?.tep;
  return isTepPlanVersionMetadata(tep) ? tep : undefined;
}

export function buildTepPlanVersionMetadata(input: {
  decisionHooks: DecisionHook[];
  recoveryGraph?: RecoveryGraph;
  recoveryGraphApplied?: string;
  syncedAt?: string;
}): TepPlanVersionMetadata {
  return {
    schemaId: TEP_PLAN_VERSION_METADATA_SCHEMA,
    decisionHooks: input.decisionHooks,
    recoveryGraph: input.recoveryGraph,
    recoveryGraphApplied: input.recoveryGraphApplied,
    syncedAt: input.syncedAt ?? new Date().toISOString(),
  };
}
