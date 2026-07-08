import type { TravelContextStage } from './travel-context.constants';

/** Inputs used to derive monotonic revision + binding sub-versions */
export interface TravelContextRevisionInput {
  updatedAtMs: number;
  constraintsVersion?: number;
  effectivePlanVersionId?: string;
  worldStateVersion?: string;
  generationVersion?: number | null;
  stage?: TravelContextStage;
}

/**
 * Phase 0: revision = updatedAt epoch ms (monotonic while updatedAt only increases).
 * Sub-version detail lives in bindings.
 */
export function computeTravelContextRevision(input: TravelContextRevisionInput): number {
  const ms = Number.isFinite(input.updatedAtMs) ? input.updatedAtMs : 0;
  return ms > 0 ? ms : Date.now();
}

export function buildTravelContextSnapshotId(contextId: string, revision: number): string {
  return `tctx_${contextId}_${revision}`;
}

export function buildWorldStateVersionLabel(worldSnapshotId?: string): string {
  return worldSnapshotId?.trim() || 'world_none';
}
