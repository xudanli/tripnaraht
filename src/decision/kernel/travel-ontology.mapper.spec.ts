import {
  appendCommittedActionIds,
  buildTravelOntologyStateFromOrchestrator,
  mergeTravelOntologyState,
  ontologyContextToNouns,
  actionPlanToVerbsPending,
} from './travel-ontology.mapper';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type { DecisionState } from './decision-state.types';
import { buildPatchFromDSOPrimary, orchestratorStateToDecisionStatePatch } from './orchestrator-state-mapper';

describe('travel-ontology.mapper', () => {
  it('ontologyContextToNouns maps flights hotels activities and stable ids', () => {
    const nouns = ontologyContextToNouns({
      trip_id: 'T1',
      destination: { name: 'Paris', destination_id: 'd1' },
      flights: [{ flight_id: 'F1', flight_no: 'AF99', departure_time: '2026-06-01T10:00:00Z' }],
      hotels: [{ hotel_id: 'H1', name: 'XYZ' }],
      activities: [{ activity_id: 'A1', name: 'Tower', start_time: '2026-06-02T09:00:00Z' }],
      transportations: [{ mode: 'SUBWAY', provider: 'RATP' }],
    });
    expect(nouns.destination?.id).toBe('d1');
    expect(nouns.flights?.[0].id).toBe('F1');
    expect(nouns.hotels?.[0].id).toBe('H1');
    expect(nouns.activities?.[0].id).toBe('A1');
    expect(nouns.transportation?.[0].id).toBeDefined();
  });

  it('buildTravelOntologyStateFromOrchestrator returns undefined when empty', () => {
    const os: OrchestratorState = {
      request_id: 'r1',
      current_step: 'INTAKE',
      trip_plan_request: { request_id: 'r1', origin: '', destination: '' },
      itinerary: { request_id: 'r1', days: [] },
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
    };
    expect(buildTravelOntologyStateFromOrchestrator(os)).toBeUndefined();
  });

  it('buildTravelOntologyStateFromOrchestrator merges ontology_context and action_plan', () => {
    const os: OrchestratorState = {
      request_id: 'r1',
      current_step: 'PLAN_GEN',
      trip_plan_request: {
        request_id: 'r1',
        origin: '',
        destination: 'Paris',
        ontology_context: { trip_id: 'TRIP123', destination: { name: 'Paris' } },
      },
      itinerary: {
        request_id: 'r1',
        days: [],
        action_plan: [
          {
            action_id: 'a1',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            requires_confirmation: true,
            risk_level: 'HIGH',
          },
        ],
      },
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
    };
    const tos = buildTravelOntologyStateFromOrchestrator(os);
    expect(tos?.tripId).toBe('TRIP123');
    expect(tos?.nouns?.destination?.name).toBe('Paris');
    expect(tos?.verbs?.pending).toHaveLength(1);
    expect(tos?.verbs?.pending?.[0].actionId).toBe('a1');
    expect(tos?.verbs?.committed).toBeUndefined();
  });

  it('mergeTravelOntologyState preserves committed when patch only updates pending', () => {
    const base: DecisionState['travelOntologyState'] = {
      tripId: 'T',
      verbs: { pending: [], committed: ['c1'], rolledBack: [] },
    };
    const incoming: DecisionState['travelOntologyState'] = {
      verbs: { pending: [{ actionId: 'a2', verb: 'NOTIFY', targetType: 'ITINERARY', requiresConfirmation: false, riskLevel: 'LOW' }] },
    };
    const m = mergeTravelOntologyState(base, incoming);
    expect(m?.verbs?.committed).toEqual(['c1']);
    expect(m?.verbs?.pending).toHaveLength(1);
  });

  it('buildPatchFromDSOPrimary merges DSO travel ontology with orchestrator fragment', () => {
    const dso: DecisionState = {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'r1', version: 1 },
      requestId: 'r1',
      travelOntologyState: {
        tripId: 'T',
        verbs: { pending: [], committed: ['done'], rolledBack: [] },
      },
    };
    const os: OrchestratorState = {
      request_id: 'r1',
      current_step: 'VERIFY',
      trip_plan_request: {
        request_id: 'r1',
        origin: '',
        destination: 'X',
        ontology_context: { flights: [{ flight_id: 'FX', flight_no: 'ZZ1' }] },
      },
      itinerary: { request_id: 'r1', days: [] },
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
    };
    const patch = buildPatchFromDSOPrimary(dso, os);
    expect(patch.travelOntologyState?.nouns?.flights?.[0].id).toBe('FX');
    expect(patch.travelOntologyState?.verbs?.committed).toEqual(['done']);
  });

  it('orchestratorStateToDecisionStatePatch carries travelOntologyState', () => {
    const os: OrchestratorState = {
      request_id: 'r1',
      current_step: 'GATE_EVAL',
      trip_plan_request: {
        request_id: 'r1',
        origin: '',
        destination: 'Y',
        ontology_context: { trip_id: 'T2' },
      },
      itinerary: { request_id: 'r1', days: [] },
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
    };
    const p = orchestratorStateToDecisionStatePatch(os);
    expect(p.travelOntologyState?.tripId).toBe('T2');
  });
});

describe('actionPlanToVerbsPending', () => {
  it('returns empty when no plan', () => {
    expect(actionPlanToVerbsPending(undefined)).toEqual([]);
  });
});

describe('appendCommittedActionIds', () => {
  it('appends unique ids and preserves pending', () => {
    const next = appendCommittedActionIds(
      {
        tripId: 'T',
        verbs: {
          pending: [{ actionId: 'p1', verb: 'BOOK', targetType: 'FLIGHT', requiresConfirmation: false, riskLevel: 'LOW' }],
          committed: ['c0'],
          rolledBack: [],
        },
      },
      ['c1', 'c1', 'c2'],
    );
    expect(next?.verbs?.committed).toEqual(['c0', 'c1', 'c2']);
    expect(next?.verbs?.pending).toHaveLength(1);
  });
});
