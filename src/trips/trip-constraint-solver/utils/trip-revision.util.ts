import { createHash } from 'crypto';

export interface TripRevisionInfo {
  revision: number;
  revisionLabel: string;
}

const SNAPSHOT_META_KEY = 'feasibilityReportSnapshot';
const MONTE_CARLO_SNAPSHOT_META_KEY = 'feasibilityMonteCarloSnapshot';

export function resolveTripRevision(trip: {
  updatedAt: Date;
  metadata?: unknown;
}): TripRevisionInfo {
  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const stored = meta.revision;
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
    const rev = Math.floor(stored);
    return { revision: rev, revisionLabel: `V${rev}` };
  }
  const fallback = Math.floor(trip.updatedAt.getTime() / 1000);
  return { revision: fallback, revisionLabel: `V${fallback}` };
}

export function revisionToString(info: TripRevisionInfo): string {
  return String(info.revision);
}

export function readFeasibilitySnapshot(metadata: unknown): Record<string, unknown> | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const snap = meta[SNAPSHOT_META_KEY];
  return snap && typeof snap === 'object' ? (snap as Record<string, unknown>) : null;
}

export function buildFeasibilitySnapshotPayload(input: {
  verifiedAt: string;
  verifiedForTripVersion: string;
  overallScore: number;
  verdictStatus: string;
  gateResult?: string;
}): Record<string, unknown> {
  return {
    verifiedAt: input.verifiedAt,
    verifiedForTripVersion: input.verifiedForTripVersion,
    overallScore: input.overallScore,
    verdictStatus: input.verdictStatus,
    ...(input.gateResult ? { gateResult: input.gateResult } : {}),
  };
}

export function snapshotMetaPatch(snapshot: Record<string, unknown>, existingMeta: unknown): Record<string, unknown> {
  const meta = { ...((existingMeta ?? {}) as Record<string, unknown>) };
  meta[SNAPSHOT_META_KEY] = snapshot;
  return meta;
}

export function readMonteCarloSnapshot(metadata: unknown): Record<string, unknown> | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const snap = meta[MONTE_CARLO_SNAPSHOT_META_KEY];
  return snap && typeof snap === 'object' ? (snap as Record<string, unknown>) : null;
}

export function monteCarloSnapshotMetaPatch(
  snapshot: Record<string, unknown>,
  existingMeta: unknown,
): Record<string, unknown> {
  const meta = { ...((existingMeta ?? {}) as Record<string, unknown>) };
  meta[MONTE_CARLO_SNAPSHOT_META_KEY] = snapshot;
  return meta;
}

/** Stable issue id from source id */
export function normalizeIssueId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('issue-')) return trimmed;
  if (trimmed.startsWith('coverage-gap:')) return `issue-${trimmed.slice('coverage-gap:'.length)}`;
  if (trimmed.startsWith('conflict-')) return `issue-${trimmed.slice('conflict-'.length)}`;
  if (/^(transport|schedule|evidence|finding|buffer)-/.test(trimmed)) {
    return `issue-${trimmed}`;
  }
  const hash = createHash('sha1').update(trimmed).digest('hex').slice(0, 10);
  return `issue-${hash}`;
}

/** Map feasibility issue id back to readiness blocker id */
/** Increment authoritative trip revision stored in metadata.revision */
export function bumpTripRevisionMetadata(metadata: unknown): Record<string, unknown> {
  const meta = { ...((metadata ?? {}) as Record<string, unknown>) };
  const stored = meta.revision;
  const current =
    typeof stored === 'number' && Number.isFinite(stored) && stored >= 0
      ? Math.floor(stored)
      : 0;
  meta.revision = current + 1;
  return meta;
}

/** Map feasibility issue id back to readiness blocker id */
export function resolveIssueIdToBlockerId(issueId: string): string {
  if (issueId.startsWith('coverage-gap:')) return issueId;
  if (issueId.startsWith('issue-coverage-gap:')) {
    return `coverage-gap:${issueId.slice('issue-coverage-gap:'.length)}`;
  }
  if (issueId.startsWith('issue-')) {
    const tail = issueId.slice('issue-'.length);
    if (/^gap-/.test(tail)) return `coverage-gap:${tail}`;
    if (/^(transport|schedule|evidence|finding|buffer)-/.test(tail)) return tail;
    return issueId;
  }
  return issueId;
}
