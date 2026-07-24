/**
 * Pure helpers to merge alignment tuples into Trip.metadata slices.
 */

import type { CausalAlignmentTuple } from '../execution-simulation/alignment-tier3.types';
import {
  ALIGNMENT_TIER3_METADATA_KEY,
  ALIGNMENT_TIER3_REVISION_KEY,
  appendTupleToAlignmentEnvelope,
  parseAlignmentTier3FromTripMetadata,
  parseAlignmentTier3RevisionFromTripMetadata,
  type AlignmentTier3RmHints,
  type AlignmentTier3WireEnvelope,
} from './alignment-tier3-serialization';

export function loadAlignmentTier3Bundle(metadata: unknown): {
  envelope?: AlignmentTier3WireEnvelope;
  revision: number;
} {
  const meta =
    metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const revision = parseAlignmentTier3RevisionFromTripMetadata(meta);
  const envelope = parseAlignmentTier3FromTripMetadata(meta[ALIGNMENT_TIER3_METADATA_KEY]);
  return { envelope, revision };
}

export function mergeAlignmentTupleIntoTripMetadata(
  prevMetadata: Record<string, unknown>,
  tuple: CausalAlignmentTuple,
): { metadata: Record<string, unknown>; envelope: AlignmentTier3WireEnvelope; newRevision: number } {
  const currentRev = parseAlignmentTier3RevisionFromTripMetadata(prevMetadata);
  const prevEnvelope = parseAlignmentTier3FromTripMetadata(prevMetadata[ALIGNMENT_TIER3_METADATA_KEY]);
  const envelope = appendTupleToAlignmentEnvelope(prevEnvelope, tuple);
  const newRevision = currentRev + 1;
  return {
    envelope,
    newRevision,
    metadata: {
      ...prevMetadata,
      [ALIGNMENT_TIER3_METADATA_KEY]: envelope,
      [ALIGNMENT_TIER3_REVISION_KEY]: newRevision,
    },
  };
}

export function extractRmHintsFromTripMetadata(metadata: unknown): AlignmentTier3RmHints | null {
  const { envelope } = loadAlignmentTier3Bundle(metadata);
  return envelope?.rmHints ?? null;
}
