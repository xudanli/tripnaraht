import { buildExecutionTruthDAG } from '../execution-truth-dag';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { clearExecutionMemoryStore } from '../execution-memory';
import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';
import type { TripWorldState } from '../decision/world-model';
import type { TripPlan } from '../decision/plan-model';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../execution-overlay/execution-overlay-frame.types';
import { neptuneRepairPlan } from '../decision/strategies/neptune';
import {
  runExecutionCognitiveOrchestration,
  shouldRunEcoPipeline,
  commitEcoWorldModelUpdate,
} from './execution-cognitive-orchestrator';

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

describe('execution cognitive orchestrator (ECO)', () => {
  beforeEach(() => {
    clearExecutionMemoryStore();
  });

  it('runs P7+P9+P10 in partial mode (skips P8 counterfactual audit)', () => {
    const state = minimalState();
    state.policies = {
      ecoPipeline: { enabled: true, mode: 'partial' },
      semanticProofLayer: true,
      emitExecutionProof: true,
    };

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

    state.signals.physicsFieldIndex = buildPhysicsFieldIndex([
      normalizeUnifiedPhysicsField({
        legId: 'slot-a',
        date: '2026-06-01',
        stateVector: {
          mobility: 0.72,
          exposure: 0.28,
          energy: 0.81,
          temporalPressure: 0.19,
        },
        constraints: { blocked: false, severity: 'LOW' },
        derived: 'STABLE',
      }),
    ]);

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;
    state.signals.executionOverlayFrames = frames;

    expect(shouldRunEcoPipeline(state)).toBe(true);

    let repaired = neptuneRepairPlan({ state, plan, executionIR: ir });
    const eco = runExecutionCognitiveOrchestration(state, repaired);
    repaired = eco.neptuneResult;
    commitEcoWorldModelUpdate(state, eco);

    expect(eco.digest.stages?.p7).toBe(true);
    expect(eco.digest.stages?.p8).toBeUndefined();
    expect(eco.digest.stages?.p9).toBe(true);
    expect(eco.digest.stages?.p10).toBe(true);
    expect(repaired.executionProof?.semanticVariance).toBeDefined();
    expect(repaired.executionProof?.interventionSet?.length).toBeGreaterThan(0);
    expect(repaired.executionProof?.causalModelAfter).toBeDefined();
    expect(state.signals.reflectiveCausalModel).toBeDefined();
  });

  it('full mode attaches counterfactual audit fields', () => {
    const state = minimalState();
    state.policies = {
      ecoPipeline: { enabled: true, mode: 'full' },
      semanticProofLayer: true,
      emitExecutionProof: true,
    };

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

    state.signals.physicsFieldIndex = buildPhysicsFieldIndex([
      normalizeUnifiedPhysicsField({
        legId: 'slot-a',
        date: '2026-06-01',
        stateVector: {
          mobility: 0.72,
          exposure: 0.28,
          energy: 0.81,
          temporalPressure: 0.19,
        },
        constraints: { blocked: false, severity: 'LOW' },
        derived: 'STABLE',
      }),
    ]);

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    state.signals.executionTruthDAG = dag;
    state.signals.executionIR = ir;
    state.signals.executionOverlayFrames = frames;

    let repaired = neptuneRepairPlan({ state, plan, executionIR: ir });
    const eco = runExecutionCognitiveOrchestration(state, repaired);
    repaired = eco.neptuneResult;

    expect(eco.digest.stages?.p8).toBe(true);
    expect(repaired.executionProof?.chosenBranchId).toBeDefined();
    expect(repaired.executionProof?.regretDistribution?.length).toBeGreaterThan(0);
  });
});
