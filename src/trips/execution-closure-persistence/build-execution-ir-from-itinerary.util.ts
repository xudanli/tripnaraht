/**
 * Build ExecutionIR from itinerary-like snapshots (negotiation confirm / trip DB).
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { tripDbRowToItinerary } from '../../agent/utils/trip-db-to-itinerary.util';
import { itineraryToTripPlan } from '../../decision/kernel/dso-to-trips-converter';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import { ExecutionIRSources } from '../execution-ir/execution-ir.types';
import { hashJsonStable } from './hash-json-stable';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Normalize negotiation itinerary or Prisma trip row → Itinerary shape. */
export function snapshotToItineraryLike(snapshot: unknown): Itinerary | null {
  if (!isRecord(snapshot)) return null;
  if (Array.isArray(snapshot.days)) {
    return snapshot as unknown as Itinerary;
  }
  const tripDays = (snapshot.TripDay ?? snapshot.tripDays) as unknown[] | undefined;
  if (!Array.isArray(tripDays) || !tripDays.length) return null;

  return tripDbRowToItinerary(snapshot as Parameters<typeof tripDbRowToItinerary>[0]);
}

export function emptyExecutionIR(fingerprint: string): ExecutionIR {
  return {
    version: '1',
    meta: {
      source: ExecutionIRSources.DAG_COMPILER,
      dagId: `empty-${fingerprint.slice(0, 12)}`,
      compiledAt: 0,
      deterministic: true,
    },
    steps: [],
  };
}

/** Compile DAG → IR; returns empty IR when snapshot cannot produce steps. */
export function buildExecutionIRFromSnapshot(snapshot: unknown): ExecutionIR {
  const fp = hashJsonStable(snapshot);
  const itinerary = snapshotToItineraryLike(snapshot);
  if (!itinerary?.days?.length) {
    return emptyExecutionIR(fp);
  }

  try {
    const tripPlan = itineraryToTripPlan(itinerary);
    if (!tripPlan.days.length) {
      return emptyExecutionIR(fp);
    }
    const frames = buildExecutionOverlay({ plan: tripPlan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan: tripPlan, overlayFrames: frames });
    return compileDAGToIR(dag);
  } catch {
    return emptyExecutionIR(fp);
  }
}
