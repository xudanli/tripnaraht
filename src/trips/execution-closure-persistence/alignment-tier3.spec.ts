import { describe, expect, it } from '@jest/globals';
import { captureAlignmentTupleFromRevision, listRemovedItemIds } from './capture-alignment-tuple.util';
import {
  appendTupleToAlignmentEnvelope,
  computeRmHintsFromTuples,
  parseAlignmentTier3FromTripMetadata,
} from './alignment-tier3-serialization';
import { mergeAlignmentTupleIntoTripMetadata } from './persist-alignment-tier3';
import { buildExecutionIRFromSnapshot } from './build-execution-ir-from-itinerary.util';

describe('alignment-tier3 persistence', () => {
  const parent = {
    days: [
      {
        date: '2026-07-01',
        items: [
          {
            id: 'a1',
            type: 'POI',
            start_time: '2026-07-01T09:00:00.000Z',
            end_time: '2026-07-01T11:00:00.000Z',
            location_ref: { place_id: 'p1', name: 'Blue Lagoon' },
          },
          {
            id: 'a2',
            type: 'DRIVE',
            start_time: '2026-07-01T11:00:00.000Z',
            end_time: '2026-07-01T13:00:00.000Z',
          },
        ],
      },
    ],
  };

  const child = {
    days: [
      {
        date: '2026-07-01',
        items: [
          {
            id: 'a1',
            type: 'POI',
            start_time: '2026-07-01T10:00:00.000Z',
            end_time: '2026-07-01T12:00:00.000Z',
            location_ref: { place_id: 'p1', name: 'Blue Lagoon' },
          },
        ],
      },
    ],
  };

  it('lists removed item ids between snapshots', () => {
    expect(listRemovedItemIds(parent, child)).toEqual(['a2']);
  });

  it('builds execution IR from itinerary snapshot', () => {
    const ir = buildExecutionIRFromSnapshot(parent);
    expect(ir.version).toBe('1');
    expect(ir.meta.source).toBe('DAG_COMPILER');
  });

  it('captures causal alignment tuple with penalties', () => {
    const tuple = captureAlignmentTupleFromRevision({
      tripId: 'trip-1',
      parentSnapshot: parent,
      childSnapshot: child,
      audit: {
        delta_cost_usd: null,
        delta_time_minutes: 60,
        interrupted_items: [{ item_id: 'a1', field: 'start_time' }],
        resolution_type: 'POSTPONE_SCHEDULE',
      },
      revisionId: 'rev-1',
      source: 'negotiation_confirm',
    });
    expect(tuple.tripId).toBe('trip-1');
    expect(tuple.discardReason).toBe('TIME_CONFLICT');
    expect(tuple.affectedNodeIds).toContain('a2');
    expect(tuple.organizationalPenalty).toBeGreaterThan(0);
    expect(tuple.intendedIR.steps.length).toBeGreaterThanOrEqual(0);
  });

  it('merges tuple into trip metadata ring buffer', () => {
    const tuple = captureAlignmentTupleFromRevision({
      tripId: 'trip-1',
      parentSnapshot: parent,
      childSnapshot: child,
      audit: {
        delta_cost_usd: null,
        delta_time_minutes: null,
        interrupted_items: [],
        resolution_type: 'ROLLBACK',
      },
    });
    const merged = mergeAlignmentTupleIntoTripMetadata({}, tuple);
    expect(merged.newRevision).toBe(1);
    expect(merged.envelope.tuples).toHaveLength(1);
    expect(merged.metadata.alignmentTier3V1).toBeDefined();

    const parsed = parseAlignmentTier3FromTripMetadata(merged.metadata.alignmentTier3V1);
    expect(parsed?.tuples[0]?.tupleId).toBe(tuple.tupleId);
    expect(parsed?.rmHints.tupleCount).toBe(1);
  });

  it('computes rm hints from recent tuples', () => {
    const t1 = captureAlignmentTupleFromRevision({
      tripId: 't',
      parentSnapshot: parent,
      childSnapshot: child,
      audit: { delta_cost_usd: null, delta_time_minutes: null, interrupted_items: [], resolution_type: 'ROLLBACK' },
    });
    const env = appendTupleToAlignmentEnvelope(undefined, t1);
    const hints = computeRmHintsFromTuples(env.tuples);
    expect(hints.organizationalWeight).toBe(t1.organizationalPenalty);
    expect(hints.lastDiscardReason).toBe('PREFERENCE_SHIFT');
  });
});
