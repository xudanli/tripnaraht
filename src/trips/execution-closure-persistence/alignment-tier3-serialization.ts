/**
 * JSON-safe wire format for Trip.metadata.alignmentTier3V1 (Prisma / cold resume).
 */

import type {
  AlignmentDiscardReason,
  CausalAlignmentTuple,
} from '../execution-simulation/alignment-tier3.types';

export const ALIGNMENT_TIER3_SCHEMA_V1 = 'alignment-tier3-v1' as const;
export const ALIGNMENT_TIER3_METADATA_KEY = 'alignmentTier3V1' as const;
export const ALIGNMENT_TIER3_REVISION_KEY = 'alignmentTier3Revision' as const;
export const ALIGNMENT_TIER3_MAX_TUPLES = 50;

export interface AlignmentTier3RmHints {
  organizationalWeight: number;
  physicalWeight: number;
  tupleCount: number;
  lastDiscardReason?: AlignmentDiscardReason;
}

export interface AlignmentTier3WireEnvelope {
  schemaVersion: typeof ALIGNMENT_TIER3_SCHEMA_V1;
  tuples: CausalAlignmentTuple[];
  rmHints: AlignmentTier3RmHints;
  lastBatchAt?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseAlignmentTier3RevisionFromTripMetadata(meta: Record<string, unknown>): number {
  const r = meta[ALIGNMENT_TIER3_REVISION_KEY];
  return typeof r === 'number' && Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
}

export function computeRmHintsFromTuples(tuples: CausalAlignmentTuple[]): AlignmentTier3RmHints {
  const recent = tuples.slice(-10);
  if (!recent.length) {
    return { organizationalWeight: 0, physicalWeight: 0, tupleCount: 0 };
  }
  const last = recent[recent.length - 1]!;
  return {
    organizationalWeight: Math.max(...recent.map((t) => t.organizationalPenalty), 0),
    physicalWeight: Math.max(...recent.map((t) => t.physicalPenalty), 0),
    tupleCount: tuples.length,
    lastDiscardReason: last.discardReason,
  };
}

export function appendTupleToAlignmentEnvelope(
  prev: AlignmentTier3WireEnvelope | undefined,
  tuple: CausalAlignmentTuple,
): AlignmentTier3WireEnvelope {
  const tuples = [...(prev?.tuples ?? []), tuple].slice(-ALIGNMENT_TIER3_MAX_TUPLES);
  return {
    schemaVersion: ALIGNMENT_TIER3_SCHEMA_V1,
    tuples,
    rmHints: computeRmHintsFromTuples(tuples),
    lastBatchAt: tuple.capturedAt,
  };
}

export function serializeAlignmentTier3ForTripMetadata(
  envelope: AlignmentTier3WireEnvelope,
): AlignmentTier3WireEnvelope {
  return envelope;
}

export function parseAlignmentTier3FromTripMetadata(
  raw: unknown,
): AlignmentTier3WireEnvelope | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ALIGNMENT_TIER3_SCHEMA_V1) return undefined;
  if (!Array.isArray(raw.tuples)) return undefined;
  const rmHints = raw.rmHints;
  if (!isRecord(rmHints)) return undefined;
  if (
    typeof rmHints.organizationalWeight !== 'number' ||
    typeof rmHints.physicalWeight !== 'number'
  ) {
    return undefined;
  }
  return raw as unknown as AlignmentTier3WireEnvelope;
}
