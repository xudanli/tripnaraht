import type { Itinerary } from '../../interfaces/trip-plan.interface';
import type { PlanDeltaIR } from '../../contracts/plan-delta-ir.types';

/** 按天叙述缓存（0-based day index → narrative text） */
export type NarrativeDayCache = Record<number, string>;

export interface IncrementalNarratorInput {
  itinerary: Itinerary;
  planDeltas: ReadonlyArray<PlanDeltaIR>;
  existingNarrativeCache?: NarrativeDayCache;
  userQuery?: string;
  tripId?: string | null;
}

export interface IncrementalNarratorOutput {
  dayNarratives: NarrativeDayCache;
  updatedDayIndices: number[];
  isIncremental: boolean;
  affectedDayIndices: number[];
}

export type NarrativeIncrementalAuditV1 = {
  revision: 'v1';
  is_incremental: boolean;
  affected_days_0based: number[];
  updated_days_0based: number[];
  cache_hits: number;
  cache_misses: number;
};
