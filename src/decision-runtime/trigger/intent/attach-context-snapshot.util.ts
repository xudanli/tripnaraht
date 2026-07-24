/**
 * Attach Trip Context Snapshot refs to Decision Trigger metadata (S1 contract).
 */

import type { DecisionTriggerInput } from '../../contracts/decision-run-request';
import type { TripIntentContextSnapshotRef } from './trip-intent.types';

export const CONTEXT_SNAPSHOT_METADATA_KEYS = {
  snapshotId: 'contextSnapshotId',
  revision: 'contextSnapshotRevision',
  constraintsVersion: 'constraintsVersion',
  effectivePlanVersionId: 'effectivePlanVersionId',
} as const;

export function attachContextSnapshotToTriggerInput(
  input: DecisionTriggerInput,
  snapshot: TripIntentContextSnapshotRef,
): DecisionTriggerInput {
  return {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      [CONTEXT_SNAPSHOT_METADATA_KEYS.snapshotId]: snapshot.snapshotId,
      [CONTEXT_SNAPSHOT_METADATA_KEYS.revision]: snapshot.revision,
      [CONTEXT_SNAPSHOT_METADATA_KEYS.constraintsVersion]: snapshot.constraintsVersion,
      ...(snapshot.effectivePlanVersionId
        ? { [CONTEXT_SNAPSHOT_METADATA_KEYS.effectivePlanVersionId]: snapshot.effectivePlanVersionId }
        : {}),
    },
  };
}

export function readContextSnapshotFromMetadata(
  metadata?: Record<string, unknown>,
): TripIntentContextSnapshotRef | undefined {
  if (!metadata) return undefined;
  const snapshotId = metadata[CONTEXT_SNAPSHOT_METADATA_KEYS.snapshotId];
  const revision = metadata[CONTEXT_SNAPSHOT_METADATA_KEYS.revision];
  if (typeof snapshotId !== 'string' || typeof revision !== 'string') {
    return undefined;
  }
  const constraintsVersionRaw = metadata[CONTEXT_SNAPSHOT_METADATA_KEYS.constraintsVersion];
  const effectivePlanVersionIdRaw =
    metadata[CONTEXT_SNAPSHOT_METADATA_KEYS.effectivePlanVersionId];
  return {
    snapshotId,
    revision,
    constraintsVersion: typeof constraintsVersionRaw === 'number' ? constraintsVersionRaw : 0,
    effectivePlanVersionId:
      typeof effectivePlanVersionIdRaw === 'string' ? effectivePlanVersionIdRaw : undefined,
  };
}

export function isContextSnapshotRequired(): boolean {
  const v = process.env.TRIP_CONTEXT_SNAPSHOT_REQUIRED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
