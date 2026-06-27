/** trip.metadata — 规划约束确认态（PRD / handoff §2） */

export type TripConstraintsMetadata = {
  constraintsVersion?: number;
  constraintsConfirmedAt?: string | null;
  constraintsConfirmedBy?: string | null;
  constraintsConfirmedVersion?: number | null;
  travelers?: unknown[];
};

export type ConstraintsMetaSnapshot = {
  constraintsVersion: number;
  constraintsConfirmedAt: string | null;
  constraintsConfirmedBy: string | null;
};

export function readConstraintsMetadata(metadata: unknown): TripConstraintsMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as TripConstraintsMetadata;
}

export function getConstraintsVersion(metadata: unknown): number {
  return readConstraintsMetadata(metadata).constraintsVersion ?? 0;
}

export function snapshotConstraintsMeta(metadata: unknown): ConstraintsMetaSnapshot {
  const m = readConstraintsMetadata(metadata);
  return {
    constraintsVersion: m.constraintsVersion ?? 0,
    constraintsConfirmedAt: m.constraintsConfirmedAt ?? null,
    constraintsConfirmedBy: m.constraintsConfirmedBy ?? null,
  };
}

/** 约束字段变更：version +1，清除确认态 */
export function bumpConstraintsVersion(metadata: unknown): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
  const prev = typeof base.constraintsVersion === 'number' ? base.constraintsVersion : 0;
  return {
    ...base,
    constraintsVersion: prev + 1,
    constraintsConfirmedAt: null,
    constraintsConfirmedBy: null,
    constraintsConfirmedVersion: null,
  };
}

export function applyConstraintsConfirm(
  metadata: unknown,
  userId: string,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
  const version = getConstraintsVersion(base);
  return {
    ...base,
    constraintsConfirmedAt: new Date().toISOString(),
    constraintsConfirmedBy: userId,
    constraintsConfirmedVersion: version,
  };
}

/** version 与确认快照一致 */
export function isConstraintsVersionConfirmed(metadata: unknown): boolean {
  const m = readConstraintsMetadata(metadata);
  if (!m.constraintsConfirmedAt) return false;
  const v = m.constraintsVersion ?? 0;
  return (m.constraintsConfirmedVersion ?? -1) === v;
}
