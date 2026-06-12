import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { TravelPartyPersona } from '../decision/models/travel-party-persona.model';
import { executeRobustnessRollout } from './execute-robustness-rollout';
import {
  projectLatentStateFromPersona,
  projectRobustnessPartyFromPersonas,
} from './project-latent-state.util';
import { evaluateStepStress } from '../causal-physics/social-stress-engine';
import { inferAlignmentPenalties } from './alignment-tier3.types';

function samplePlan(): TripPlan {
  return {
    version: '1',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-09-01',
        timeSlots: [
          {
            id: 'n1',
            time: '09:00',
            title: 'Drive A',
            type: 'transport',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64, lng: -22 },
              to: { lat: 64.1, lng: -21.9 },
              durationMin: 360,
            },
          },
          {
            id: 'n2',
            time: '16:00',
            title: 'Activity B',
            type: 'activity',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64.1, lng: -21.9 },
              to: { lat: 64.2, lng: -21.8 },
              durationMin: 90,
            },
          },
        ],
      },
      {
        day: 4,
        date: '2026-09-04',
        timeSlots: [
          {
            id: 'n3',
            time: '08:00',
            title: 'Long haul',
            type: 'transport',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64.2, lng: -21.8 },
              to: { lat: 65, lng: -20 },
              durationMin: 420,
            },
          },
        ],
      },
    ],
  };
}

function lowTolerancePersona(): TravelPartyPersona {
  return {
    memberId: 'member-a',
    role: 'PRIMARY_TRAVELER',
    capability: {
      maxDailyAscentM: 400,
      rollingAscent3DaysM: 900,
      maxSlopePct: 15,
      preferredPace: 'SLOW',
      riskTolerance: 'LOW',
    },
    experience: {
      tempo: 'LEISURELY',
      heterogeneityIndex: 0.85,
      surpriseBuffer: 0.2,
      currentFrictionCapacity: 0.9,
    },
  };
}

function highTolerancePersona(): TravelPartyPersona {
  return {
    memberId: 'member-b',
    role: 'COMPANION',
    capability: {
      maxDailyAscentM: 1200,
      rollingAscent3DaysM: 2800,
      maxSlopePct: 35,
      preferredPace: 'FAST',
      riskTolerance: 'HIGH',
    },
    experience: {
      tempo: 'ACCELERATED',
      heterogeneityIndex: 0.4,
      surpriseBuffer: 0.5,
      currentFrictionCapacity: 0.35,
    },
  };
}

describe('Robustness Rollout (physical + organizational)', () => {
  function buildFixture() {
    const plan = samplePlan();
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);
    return { dag, ir };
  }

  it('projectLatentStateFromPersona maps pace/risk to latent axes', () => {
    const low = projectLatentStateFromPersona(lowTolerancePersona());
    const high = projectLatentStateFromPersona(highTolerancePersona());
    expect(low.fatigue_tolerance).toBeLessThan(high.fatigue_tolerance);
    expect(low.risk_aversion).toBeGreaterThan(high.risk_aversion);
    expect(low.motive_distribution.exploration).toBeLessThan(high.motive_distribution.exploration);
  });

  it('evaluateStepStress rises under long duration + low tolerance', () => {
    const party = projectRobustnessPartyFromPersonas([lowTolerancePersona()]);
    const short = evaluateStepStress(
      { nodeId: 'n1', durationMinutes: 120, weatherSeverity: 0.2 },
      party,
    );
    const long = evaluateStepStress(
      { nodeId: 'n3', durationMinutes: 420, elevationGainM: 600, weatherSeverity: 0.6 },
      party,
    );
    expect(long.socialStress).toBeGreaterThan(short.socialStress);
  });

  it('executeRobustnessRollout returns dual scores and conflict curve timeline', () => {
    const { dag, ir } = buildFixture();
    const fragileParty = projectRobustnessPartyFromPersonas([lowTolerancePersona()]);
    const resilientParty = projectRobustnessPartyFromPersonas([highTolerancePersona()]);

    const fragile = executeRobustnessRollout(
      {
        baseIR: ir,
        party: fragileParty,
        simulationConfig: {
          sampleCount: 20,
          enabledPerturbations: ['WEATHER', 'TRANSPORT', 'FATIGUE', 'SOCIAL'],
        },
      },
      { witnessDag: dag, mode: 'SIMULATION' },
    );

    const resilient = executeRobustnessRollout(
      {
        baseIR: ir,
        party: resilientParty,
        simulationConfig: {
          sampleCount: 20,
          enabledPerturbations: ['WEATHER', 'TRANSPORT', 'FATIGUE', 'SOCIAL'],
        },
      },
      { witnessDag: dag, mode: 'SIMULATION' },
    );

    expect(fragile.physicalRobustnessScore).toBeGreaterThanOrEqual(0);
    expect(fragile.physicalRobustnessScore).toBeLessThanOrEqual(1);
    expect(fragile.organizationalRobustnessScore).toBeGreaterThanOrEqual(0);
    expect(fragile.timeline.length).toBeGreaterThan(0);
    expect(fragile.sampleSummaries).toHaveLength(20);

    expect(resilient.organizationalRobustnessScore).toBeGreaterThanOrEqual(
      fragile.organizationalRobustnessScore,
    );

    const longHaulNode = fragile.timeline.find(t => t.nodeId.includes('n3') || t.timestamp === '2026-09-04');
    if (longHaulNode) {
      expect(longHaulNode.socialStressIndex).toBeGreaterThan(0);
    }
  });

  it('detects bottlenecks and emits contingency B-axis stubs', () => {
    const { dag, ir } = buildFixture();
    const mixedParty = projectRobustnessPartyFromPersonas([
      lowTolerancePersona(),
      highTolerancePersona(),
    ]);

    const result = executeRobustnessRollout(
      {
        baseIR: ir,
        party: mixedParty,
        simulationConfig: {
          sampleCount: 30,
          enabledPerturbations: ['WEATHER', 'FATIGUE', 'SOCIAL'],
          organizationalStressThreshold: 0.55,
        },
      },
      { witnessDag: dag },
    );

    if (result.bottlenecks.length > 0) {
      expect(result.contingencyPlans.length).toBeGreaterThan(0);
      expect(result.contingencyPlans[0].mutatedIR.steps.length).toBeGreaterThan(ir.steps.length);
    }
  });

  it('inferAlignmentPenalties maps FATIGUE_OVERFLOW to high organizational penalty', () => {
    const p = inferAlignmentPenalties({
      affectedNodeIds: ['n3'],
      discardReason: 'FATIGUE_OVERFLOW',
      durationMinutesRemoved: 360,
    });
    expect(p.organizationalPenalty).toBeGreaterThan(p.physicalPenalty);
  });
});
