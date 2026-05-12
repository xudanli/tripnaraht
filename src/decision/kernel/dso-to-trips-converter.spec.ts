import {
  decisionStateToTripWorldState,
  itineraryToRoutePlanDraft,
  isWestfjordsCorridorHeuristic,
  resolveKernelTripIdHint,
} from './dso-to-trips-converter';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { DecisionState } from './decision-state.types';

describe('itineraryToRoutePlanDraft', () => {
  it('fills endLocation from next POI and sets auto_filled_for_audit', () => {
    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              id: 'a',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: {
                name: 'A',
                coordinates: { lat: 64.0, lng: -21.5 },
              },
              evidence_refs: [],
              verified: true,
            },
            {
              id: 'b',
              type: 'POI',
              start_window: '11:00',
              end_window: '12:00',
              location_ref: {
                name: 'B',
                coordinates: { lat: 64.1, lng: -21.4 },
              },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
      ],
    };
    const draft = itineraryToRoutePlanDraft(itinerary, 't1', 'rd1');
    expect(draft.segments).toHaveLength(2);
    const m0 = draft.segments[0].metadata as Record<string, unknown>;
    expect(m0.endLocation).toEqual({ lat: 64.1, lng: -21.4 });
    expect(m0.auto_filled_for_audit).toBe(true);
    expect(m0.terrain_audit_trigger).toBeUndefined();
    const m1 = draft.segments[1].metadata as Record<string, unknown>;
    expect(m1.endLocation).toBeUndefined();
    expect(m1.auto_filled_for_audit).toBeUndefined();
  });

  it('uses explicit metadata.endLocation without auto_filled_for_audit', () => {
    const itinerary: Itinerary = {
      request_id: 'r2',
      days: [
        {
          date: '2026-06-02',
          items: [
            {
              id: 'x',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: {
                name: 'X',
                coordinates: { lat: 1, lng: 2 },
              },
              evidence_refs: [],
              verified: true,
              metadata: {
                endLocation: { lat: 5, lng: 6 },
              },
            },
            {
              id: 'y',
              type: 'POI',
              start_window: '11:00',
              end_window: '12:00',
              location_ref: {
                name: 'Y',
                coordinates: { lat: 9, lng: 9 },
              },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
      ],
    };
    const draft = itineraryToRoutePlanDraft(itinerary, 't2', 'rd2');
    const mx = draft.segments[0].metadata as Record<string, unknown>;
    expect(mx.endLocation).toEqual({ lat: 5, lng: 6 });
    expect(mx.auto_filled_for_audit).toBeUndefined();
  });

  it('chains last item of day to first item of next day', () => {
    const itinerary: Itinerary = {
      request_id: 'r3',
      days: [
        {
          date: '2026-06-03',
          items: [
            {
              id: 'd1',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: { name: 'P1', coordinates: { lat: 10, lng: 20 } },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
        {
          date: '2026-06-04',
          items: [
            {
              id: 'd2',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: { name: 'P2', coordinates: { lat: 11, lng: 21 } },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
      ],
    };
    const draft = itineraryToRoutePlanDraft(itinerary, 't3', 'rd3');
    expect(draft.segments).toHaveLength(2);
    const m0 = draft.segments[0].metadata as Record<string, unknown>;
    expect(m0.endLocation).toEqual({ lat: 11, lng: 21 });
    expect(m0.auto_filled_for_audit).toBe(true);
  });

  it('tags westfjords_corridor_heuristic when auto-filled chain lies in Westfjords bbox', () => {
    expect(isWestfjordsCorridorHeuristic(65.7, -22.5)).toBe(true);
    const itinerary: Itinerary = {
      request_id: 'wf',
      days: [
        {
          date: '2026-07-01',
          items: [
            {
              id: 'wf1',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: { name: 'A', coordinates: { lat: 65.7, lng: -22.5 } },
              evidence_refs: [],
              verified: true,
            },
            {
              id: 'wf2',
              type: 'POI',
              start_window: '11:00',
              end_window: '12:00',
              location_ref: { name: 'B', coordinates: { lat: 65.75, lng: -22.4 } },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
      ],
    };
    const draft = itineraryToRoutePlanDraft(itinerary, 't-wf', 'rd-wf');
    const m0 = draft.segments[0].metadata as Record<string, unknown>;
    expect(m0.terrain_audit_trigger).toBe('westfjords_corridor_heuristic');
  });
});

describe('decisionStateToTripWorldState', () => {
  it('maps travelOntologyState.tripId to context.tripId', () => {
    const state: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'req-1' },
      travelOntologyState: { tripId: 'trip-from-dso' },
    };
    const world = decisionStateToTripWorldState(state);
    expect(world.context.tripId).toBe('trip-from-dso');
  });

  it('uses prismaTripId option when ontology absent', () => {
    const state: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'req-2' },
    };
    const world = decisionStateToTripWorldState(state, { prismaTripId: 'trip-opt' });
    expect(world.context.tripId).toBe('trip-opt');
  });

  it('resolveKernelTripIdHint + options maps systemState.requestId to context.tripId', () => {
    const state: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'trip-from-request' },
    };
    const world = decisionStateToTripWorldState(state, {
      prismaTripId: resolveKernelTripIdHint(state),
    });
    expect(world.context.tripId).toBe('trip-from-request');
  });
});

describe('resolveKernelTripIdHint', () => {
  it('prefers travelOntologyState.tripId over systemState.requestId', () => {
    const state: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'req-kernel' },
      travelOntologyState: { tripId: 'ontology-wins' },
    };
    expect(resolveKernelTripIdHint(state)).toBe('ontology-wins');
  });

  it('falls back to requestId when not unknown', () => {
    const state: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'cmjwbcd1234567890abcd' },
    };
    expect(resolveKernelTripIdHint(state)).toBe('cmjwbcd1234567890abcd');
  });

  it('returns undefined for unknown placeholder', () => {
    const state: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'unknown' },
    };
    expect(resolveKernelTripIdHint(state)).toBeUndefined();
  });
});
