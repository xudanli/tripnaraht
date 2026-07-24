import { createHash } from 'crypto';
import type { ActiveRiskCode, ActiveRiskType } from '../types/execution-risk.types';

/** Impact window bucket granularity for deduplication */
export const IMPACT_WINDOW_BUCKET_MINUTES = 60;

export interface BuildRiskKeyInput {
  tripId: string;
  type: ActiveRiskType;
  code: ActiveRiskCode;
  /** Canonical subject — placeId, segmentId, memberId, etc. */
  normalizedSubject: string;
  /** Scope bucket — activity id, route segment, day index */
  affectedScope: string;
  impactStartAt?: string;
  impactEndAt?: string;
}

export function bucketImpactWindow(iso?: string): string {
  if (!iso?.trim()) return 'open';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'open';
  const bucketMs = IMPACT_WINDOW_BUCKET_MINUTES * 60 * 1000;
  const bucket = Math.floor(ms / bucketMs);
  return new Date(bucket * bucketMs).toISOString();
}

export function buildImpactWindowBucket(input: {
  impactStartAt?: string;
  impactEndAt?: string;
}): string {
  const start = bucketImpactWindow(input.impactStartAt);
  const end = bucketImpactWindow(input.impactEndAt);
  return `${start}/${end}`;
}

export function buildRiskKey(input: BuildRiskKeyInput): string {
  const parts = [
    input.tripId,
    input.type,
    input.code,
    normalizeToken(input.normalizedSubject),
    normalizeToken(input.affectedScope),
    buildImpactWindowBucket(input),
  ];
  return parts.join('|');
}

export function deriveRiskId(tripId: string, riskKey: string): string {
  const digest = createHash('sha256').update(`${tripId}:${riskKey}`).digest('hex');
  return `risk_${digest.slice(0, 16)}`;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-./]/g, '')
    .slice(0, 128);
}
