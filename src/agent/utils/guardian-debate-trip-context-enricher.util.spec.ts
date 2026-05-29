// src/agent/utils/guardian-debate-trip-context-enricher.util.spec.ts
import { enrichGuardianDebateTripContextFromGateEval } from './guardian-debate-trip-context-enricher.util';
import type { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('enrichGuardianDebateTripContextFromGateEval', () => {
  const baseTrip = (): TripPlanRequest => ({
    request_id: 'r1',
    origin: 'OSL',
    destination: 'Geiranger',
  });

  it('writes user_intent_anchors from trip message when marathon ring road intent', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: {
        ...baseTrip(),
        message: '想利用极昼，24小时不间断自驾环岛',
      },
      research_data: {},
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    expect(
      state.trip_plan_request?.guardian_debate_trip_context?.user_intent_anchors?.midnight_sun_continuous_drive,
    ).toBe(true);
    expect(state.trip_plan_request?.guardian_debate_trip_context?.user_intent_anchors?.ring_road_full_scope).toBe(
      true,
    );
  });

  it('maps ontology_hard_anchor.road_status_by_node into environment.road_status', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: baseTrip(),
      research_data: {
        ontology_hard_anchor: {
          road_status_by_node: {
            n1: {
              aggregateAccessState: 'CLOSED',
              segments: [
                {
                  spatialSegmentId: 'F206',
                  accessState: 'CLOSED',
                  condition: 'Winter',
                  source: 'ontology_road_status',
                },
              ],
            },
          },
        },
      },
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    expect(state.trip_plan_request?.guardian_debate_trip_context?.environment?.road_status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'F206', status: 'CLOSED', source: 'ontology_road_status' }),
      ]),
    );
  });

  it('prefers manual guardian_debate_trip_context over auto road_status on same path', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: {
        ...baseTrip(),
        guardian_debate_trip_context: {
          location: 'Manual_Region',
          environment: { road_status: [{ id: 'X1', status: 'OPEN', source: 'manual' }] },
        },
      },
      research_data: {
        ontology_hard_anchor: {
          road_status_by_node: {
            n1: { aggregateAccessState: 'CLOSED', segments: [] },
          },
        },
      },
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    const rs = state.trip_plan_request?.guardian_debate_trip_context?.environment?.road_status;
    expect(rs?.some(r => r.id === 'X1')).toBe(true);
    expect(rs?.some(r => r.id === 'n1')).toBe(false);
  });

  it('maps research_data.transport_snapshots.entur to environment.ferry_status', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: baseTrip(),
      research_data: {
        transport_snapshots: {
          entur: [
            {
              service_id: 'Geiranger-Hellesylt',
              status: 'CANCELLED',
              next_departure: '2026-05-16T08:00:00Z',
              disruptions: ['Technical_Failure'],
              source: 'Entur',
            },
          ],
        },
      },
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    expect(state.trip_plan_request?.guardian_debate_trip_context?.environment?.ferry_status).toEqual([
      expect.objectContaining({
        route: 'Geiranger-Hellesylt',
        status: 'SUSPENDED',
        next_available: '2026-05-16T08:00:00Z',
      }),
    ]);
  });

  it('writes scheduling_constraints.daylight_end when coords+date+Norway zone', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: {
        ...baseTrip(),
        destination: { lat: 62.1, lng: 7.2 },
        start_date: '2026-05-15T00:00:00.000Z',
      },
      research_data: {},
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    const de = state.trip_plan_request?.guardian_debate_trip_context?.scheduling_constraints?.daylight_end;
    expect(de).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.trip_plan_request?.guardian_debate_trip_context?.scheduling_constraints?.daylight_end_source).toBe(
      'suncalc_civil_dusk_v1',
    );
  });

  it('does not overwrite manual scheduling_constraints.daylight_end', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: {
        ...baseTrip(),
        destination: { lat: 62.1, lng: 7.2 },
        start_date: '2026-05-15T00:00:00.000Z',
        guardian_debate_trip_context: {
          scheduling_constraints: { daylight_end: '2026-05-15T20:00:00.000Z' },
        },
      },
      research_data: {},
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    expect(state.trip_plan_request?.guardian_debate_trip_context?.scheduling_constraints?.daylight_end).toBe(
      '2026-05-15T20:00:00.000Z',
    );
  });

  it('copies safetravel_alerts from lightweight_research_data when top-level missing', () => {
    const state = {
      request_id: 'r1',
      current_step: 'GATE_EVAL' as const,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: '', last_updated_at: '' },
      trip_plan_request: baseTrip(),
      research_data: {
        lightweight_research_data: {
          safetravel_alerts: [{ id: 'a1', title: 'Wind', severity: 'orange' }],
        },
      },
    } as unknown as OrchestratorState;

    enrichGuardianDebateTripContextFromGateEval(state);
    expect(state.trip_plan_request?.guardian_debate_trip_context?.environment?.route_alert_refs).toEqual([
      { id: 'a1', title: 'Wind', severity: 'orange' },
    ]);
  });
});
