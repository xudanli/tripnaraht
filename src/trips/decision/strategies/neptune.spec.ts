import { neptuneRepairPlan } from './neptune';
import type { TripWorldState } from '../world-model';
import type { TripPlan } from '../plan-model';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../../execution-overlay/execution-overlay-frame.types';
import { buildExecutionTruthDAG } from '../../execution-truth-dag';
import { compileDAGToIR } from '../../execution-ir/compile-dag-to-ir';
import { DEFAULT_EXECUTION_POLICY_V1 } from '../../execution-policy';
import {
  clearExecutionMemoryStore,
  getExecutionMemoryGraph,
  replayExecution,
} from '../../execution-memory';
import { ExecutionIRSources, type ExecutionIR } from '../../execution-ir/execution-ir.types';
import { buildPhysicsFieldIndex, buildUnifiedPhysicsField } from '../../physics';

function minimalState(): TripWorldState {
  return {
    context: {
      destination: 'IS',
      startDate: '2026-06-01',
      durationDays: 3,
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate: {},
    signals: {
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

function dummyCompilerIr(): ExecutionIR {
  return {
    version: '1',
    steps: [{ type: 'CHECK', nodeId: 'noop' }],
    meta: {
      deterministic: true,
      source: ExecutionIRSources.DAG_COMPILER,
      dagId: 'dummy',
      compiledAt: Date.now(),
    },
  };
}

describe('neptuneRepairPlan P8-3 (IR VM input)', () => {
  beforeEach(() => {
    clearExecutionMemoryStore();
  });

  it('throws NO_EXECUTION_TRUTH_SOURCE when DAG has no nodes', () => {
    const state = minimalState();
    state.signals.executionTruthDAG = { nodes: [], edges: [] };
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [],
    };
    expect(() =>
      neptuneRepairPlan({ state, plan, executionIR: dummyCompilerIr() }),
    ).toThrow('NO_EXECUTION_TRUTH_SOURCE');
  });

  it('throws when IR missing steps', () => {
    const state = minimalState();
    state.signals.executionTruthDAG = {
      nodes: [
        {
          id: 'n1',
          date: '2026-06-01',
          slotId: 'slot-a',
          type: 'LEG',
          execution: {
            finalState: 'OK',
            delayMinutes: 0,
            reliabilityScore: 0.9,
          },
          temporal: {
            daylightViolation: false,
            crossDayRisk: 0,
            arrivalRisk: 0,
          },
          weather: { exposureScore: 0 },
          road: { accessibility: 1 },
        },
      ],
      edges: [],
    };
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [],
    };
    const emptyStepsIr: ExecutionIR = {
      version: '1',
      steps: [],
      meta: {
        deterministic: true,
        source: ExecutionIRSources.DAG_COMPILER,
        dagId: 'x',
        compiledAt: 1,
      },
    };
    expect(() => neptuneRepairPlan({ state, plan, executionIR: emptyStepsIr })).toThrow(
      '[NEPTUNE] IR required',
    );
  });

  it('does not use semantic weather — DAG EXECUTABLE nodes yield no triggers', () => {
    const state = minimalState();
    state.signals.executionSemanticView = {
      lastAppliedLineage: [],
      viewVersion: '1',
      authority: { inputsFingerprint: 'x', lineage: [] },
      temporalScope: {
        rangeStartDate: '2026-06-01',
        rangeEndDate: '2026-06-03',
      },
      byDate: {
        '2026-06-01': {
          date: '2026-06-01',
          outdoorWeatherStress: { adverse: true, reasons: ['legacy_would_fire'] },
          weather: {},
        },
      },
    } as TripWorldState['signals']['executionSemanticView'];

    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'slot-a',
              time: '10:00',
              title: 'Outdoor',
              type: 'sightseeing',
              poiId: 'p1',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 30,
              },
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'slot-a',
        route: {
          legId: 'slot-a',
          terrainDifficulty: 'LOW',
          weatherExposure: {},
          roadAccessibility: { fRoad: false },
          executionReliability: 0.9,
          estimatedDelayFactor: 1,
          executionState: 'EXECUTABLE',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 0,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: false, fRoadConstraint: false },
        repair: { recommended: false },
        finalExecutionState: 'EXECUTABLE',
        unifiedDelayMinutes: 0,
        reliabilityScore: 0.9,
      },
    ];

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;
    const result = neptuneRepairPlan({ state, plan, executionIR: ir });
    expect(result.triggers.length).toBe(0);
    expect(result.irVm.ok).toBe(true);
    expect(result.bytecode.version).toBe('1');
    expect(result.bytecode.dagId).toBe(ir.meta.dagId);
    expect(result.executionTrace.length).toBeGreaterThan(0);
  });

  it('optional P10 simulationVariants attach simulation diff', () => {
    const state = minimalState();
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'slot-a',
              time: '10:00',
              title: 'Outdoor',
              type: 'sightseeing',
              poiId: 'p1',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 30,
              },
            },
          ],
        },
      ],
    };
    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'slot-a',
        route: {
          legId: 'slot-a',
          terrainDifficulty: 'LOW',
          weatherExposure: {},
          roadAccessibility: { fRoad: false },
          executionReliability: 0.9,
          estimatedDelayFactor: 1,
          executionState: 'EXECUTABLE',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 0,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: false, fRoadConstraint: false },
        repair: { recommended: false },
        finalExecutionState: 'EXECUTABLE',
        unifiedDelayMinutes: 0,
        reliabilityScore: 0.9,
      },
    ];
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;
    const result = neptuneRepairPlan({
      state,
      plan,
      executionIR: ir,
      simulationVariants: [
        { id: 'v1', perturbation: { delayBias: 0 } },
        { id: 'v2', perturbation: { delayBias: 0.15 } },
      ],
    });
    expect(result.simulation?.runs).toHaveLength(2);
    expect(result.simulation?.diff.bestVariantId).toBeDefined();
    expect(result.explanation).toContain('simBest=');
    expect(result.constraintProof?.globalStatus).toBe('FEASIBLE');
    const graph = getExecutionMemoryGraph();
    expect(graph.events.some(e => e.type === 'IR_COMPILED')).toBe(true);
    expect(graph.events.some(e => e.type === 'PROOF_EVALUATED')).toBe(true);
    expect(graph.events.some(e => e.type === 'SIMULATION_RUN')).toBe(true);
    expect(graph.snapshots).toHaveLength(1);
    const folded = replayExecution(graph.snapshots[0]!.dagId);
    expect(folded.lastProofStatus).toBe('FEASIBLE');
  });

  it('P11 executionPolicy attaches policy rank + selected variant', () => {
    const state = minimalState();
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'slot-a',
              time: '10:00',
              title: 'Outdoor',
              type: 'sightseeing',
              poiId: 'p1',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 30,
              },
            },
          ],
        },
      ],
    };
    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'slot-a',
        route: {
          legId: 'slot-a',
          terrainDifficulty: 'LOW',
          weatherExposure: {},
          roadAccessibility: { fRoad: false },
          executionReliability: 0.9,
          estimatedDelayFactor: 1,
          executionState: 'EXECUTABLE',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 0,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: false, fRoadConstraint: false },
        repair: { recommended: false },
        finalExecutionState: 'EXECUTABLE',
        unifiedDelayMinutes: 0,
        reliabilityScore: 0.9,
      },
    ];
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;
    const result = neptuneRepairPlan({
      state,
      plan,
      executionIR: ir,
      simulationVariants: [
        { id: 'v1', perturbation: { delayBias: 0 } },
        { id: 'v2', perturbation: { delayBias: 0.15 } },
      ],
      executionPolicy: DEFAULT_EXECUTION_POLICY_V1,
    });
    expect(result.simulation?.policy?.policyId).toBe('default-v1');
    expect(result.simulation?.policy?.ranked.length).toBe(2);
    expect(result.explanation).toContain('policyPick=');
  });

  it('maps DAG BLOCKED node to OVERLAY_BLOCKED', () => {
    const state = minimalState();
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-1',
              time: '09:00',
              title: 'Drive segment',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 60,
              },
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'leg-1',
        route: {
          legId: 'leg-1',
          terrainDifficulty: 'HIGH',
          weatherExposure: {},
          roadAccessibility: { fRoad: true },
          executionReliability: 0.2,
          estimatedDelayFactor: 2,
          executionState: 'BLOCKED',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 40,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: true, fRoadConstraint: true },
        repair: { recommended: false },
        finalExecutionState: 'BLOCKED',
        unifiedDelayMinutes: 40,
        reliabilityScore: 0.15,
      },
    ];

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;
    const result = neptuneRepairPlan({ state, plan, executionIR: ir });
    expect(result.triggers.some(t => t.code === 'OVERLAY_BLOCKED')).toBe(true);
    expect(result.triggers.every(t => t.details?.source === 'EXECUTION_TRUTH_DAG')).toBe(true);
    expect(result.irVm).toBeDefined();
  });

  it('P-Next 4 dagObserverOnly merges physics triggers only; IR CHECK triggers are observability-only', () => {
    const state = minimalState();
    state.policies = { dagObserverOnly: true };
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-1',
              time: '09:00',
              title: 'Drive segment',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 60,
              },
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'leg-1',
        route: {
          legId: 'leg-1',
          terrainDifficulty: 'HIGH',
          weatherExposure: {},
          roadAccessibility: { fRoad: true },
          executionReliability: 0.2,
          estimatedDelayFactor: 2,
          executionState: 'BLOCKED',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 40,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: true, fRoadConstraint: true },
        repair: { recommended: false },
        finalExecutionState: 'BLOCKED',
        unifiedDelayMinutes: 40,
        reliabilityScore: 0.15,
      },
    ];

    state.signals.physicsFieldIndex = buildPhysicsFieldIndex(
      buildUnifiedPhysicsField({
        executionOverlayFrames: frames,
        legDateByLegId: { 'leg-1': '2026-06-01' },
      }),
    );
    state.signals.executionOverlayFrames = frames;

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;

    const result = neptuneRepairPlan({ state, plan, executionIR: ir });
    expect(result.dagObserverOnly).toBe(true);
    expect(result.observerIrTriggerCount).toBeGreaterThan(0);
    expect(result.triggers.some(t => t.code === 'PHYSICS_IMPASSABLE')).toBe(true);
    expect(result.triggers.every(t => t.details?.source !== 'EXECUTION_TRUTH_DAG')).toBe(true);
    expect(result.irVm).toBeDefined();
  });

  it('P12 assertFeasibleBeforeSimulation blocks executeSimulation when DAG is infeasible', () => {
    const state = minimalState();
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-1',
              time: '09:00',
              title: 'Drive segment',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 60,
              },
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'leg-1',
        route: {
          legId: 'leg-1',
          terrainDifficulty: 'HIGH',
          weatherExposure: {},
          roadAccessibility: { fRoad: true },
          executionReliability: 0.2,
          estimatedDelayFactor: 2,
          executionState: 'BLOCKED',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 40,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: true, fRoadConstraint: true },
        repair: { recommended: false },
        finalExecutionState: 'BLOCKED',
        unifiedDelayMinutes: 40,
        reliabilityScore: 0.15,
      },
    ];

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;

    expect(() =>
      neptuneRepairPlan({
        state,
        plan,
        executionIR: ir,
        simulationVariants: [{ id: 'v1', perturbation: { delayBias: 0 } }],
      }),
    ).toThrow('[CONSTRAINT-PROOF] Execution plan infeasible');
  });
});
