/**
 * Replay Lifecycle — subsystem boundary for cognition memoization / reuse correctness.
 *
 * Phase 1–2: deterministic provenance + semantic validation.
 * Future: probabilistic replay governance (confidence decay, selective artifact reuse).
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { RuntimeExecutionProfileValidationResult } from './runtime-execution-profile.validation.types';
import type { ReplayProvenance } from './replay-provenance.types';

/** Whether a cached artefact may be served as-is (extends dedup TTL / confidence later). */
export interface ReplayDecision {
  allow: boolean;
  reasonCodes?: string[];
  /** Future: time decay × drift × policy × model (probabilistic replay governance). */
  replayConfidenceScore?: number;
}

/** Alias — invariant validation over replay semantics (execution profile + world context). */
export type ReplayValidationResult = RuntimeExecutionProfileValidationResult;

/** Future: selective branch invalidation vs full hammer. */
export interface InvalidationDecision {
  scope: 'FULL_RESPONSE' | 'PARTIAL_COGNITIVE_BRANCH' | 'NONE';
  domains?: string[];
  reasonCodes?: string[];
}

export interface ReplayStampInput {
  response: RouteAndRunResponseDto;
  request?: RouteAndRunRequestDto;
}

/** Dedup path: cached provenance + current request → validation context. */
export interface DedupValidationContextInput {
  cachedProvenance?: ReplayProvenance | null;
  request?: RouteAndRunRequestDto;
}
