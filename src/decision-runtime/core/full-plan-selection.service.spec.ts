import { Test, TestingModule } from '@nestjs/testing';
import type { TripPlan } from '../../trips/decision/plan-model';
import type { TripWorldState } from '../../trips/decision/world-model';
import { DecisionCoreService } from '../../trips/guardian-decision-core/services/decision-core.service';
import { FullPlanSelectionService } from './full-plan-selection.service';
import { LegacyTripPlanningAdapter } from '../candidates/legacy-planning.adapter';
import { ConstraintEvaluationGatewayService } from '../constraints/constraint-evaluation.gateway.service';
import { WorldStateSnapshotService } from '../snapshot/world-state-snapshot.service';
import { LegacyFrozenStrategy } from '../optimization/strategies/legacy-frozen.strategy';
import { CpSatLexicographicStrategy } from '../optimization/strategies/cp-sat-lexicographic.strategy';
import { ShadowObservabilityService } from '../observability/shadow-observability.service';
import { OptimizationShadowMetricsCollector } from '../observability/optimization-shadow-metrics.collector';
import { CanonicalSolutionPostValidatorService } from '../optimization/post-validator.service';
import { ObjectiveSemanticsRegistry } from '../objectives/objective-semantics.registry';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import { buildFullPlanDecisionWorkspace } from './build-full-plan-workspace.util';

function minimalPlan(id: string): TripPlan {
  return {
    version: 'test@v1',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-07-01',
        timeSlots: [
          {
            id: `slot_${id}`,
            time: '09:00',
            title: id,
            type: 'sightseeing',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64.1, lng: -21.9 },
              to: { lat: 64.2, lng: -21.8 },
              durationMin: 30,
            },
          },
        ],
      },
    ],
  };
}

describe('buildFullPlanDecisionWorkspace', () => {
  it('uses balanced as base and maps others to repair candidates', () => {
    const candidates: DecisionCandidate[] = [
      {
        candidateId: 'conservative',
        label: '保守',
        source: 'LEGACY_TRIP_PLANNING',
        plan: minimalPlan('c'),
        utilityHint: 0.7,
        createdAt: new Date().toISOString(),
      },
      {
        candidateId: 'balanced',
        label: '平衡',
        source: 'LEGACY_TRIP_PLANNING',
        plan: minimalPlan('b'),
        utilityHint: 0.8,
        createdAt: new Date().toISOString(),
      },
    ];

    const { workspace, baseCandidateId } = buildFullPlanDecisionWorkspace({
      problemId: 'prob_1',
      context: { tripId: 'trip_1' },
      candidates,
      constraintReportsByCandidateId: {
        conservative: {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          tripId: 'trip_1',
          evaluatedAt: new Date().toISOString(),
          assertions: [],
          completeness: {
            roads: 'MISSING',
            weather: 'MISSING',
            hazards: 'MISSING',
            ferries: 'MISSING',
            openingHours: 'MISSING',
          },
          overallStatus: 'UNVERIFIED',
          degraded: false,
          degradedReasons: [],
        },
        balanced: {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          tripId: 'trip_1',
          evaluatedAt: new Date().toISOString(),
          assertions: [],
          completeness: {
            roads: 'COMPLETE',
            weather: 'COMPLETE',
            hazards: 'COMPLETE',
            ferries: 'COMPLETE',
            openingHours: 'MISSING',
          },
          overallStatus: 'FEASIBLE',
          degraded: false,
          degradedReasons: [],
        },
      },
    });

    expect(baseCandidateId).toBe('balanced');
    expect(workspace.repairCandidates).toHaveLength(1);
    expect(workspace.repairCandidates[0].candidateId).toBe('conservative');
    expect(workspace.loadAssessments[0].targetCandidateId).toBe('conservative');
  });

  it('maps TripPlan to ADD_ITEM operations when materializeFromTripPlan is set', () => {
    const candidates: DecisionCandidate[] = [
      {
        candidateId: 'balanced',
        label: '平衡',
        source: 'LEGACY_TRIP_PLANNING',
        plan: minimalPlan('b'),
        utilityHint: 0.8,
        createdAt: new Date().toISOString(),
      },
      {
        candidateId: 'faithful',
        label: '忠实',
        source: 'LEGACY_TRIP_PLANNING',
        plan: minimalPlan('f'),
        utilityHint: 0.75,
        createdAt: new Date().toISOString(),
      },
    ];

    const { workspace, baseCandidateId } = buildFullPlanDecisionWorkspace({
      problemId: 'prob_guide',
      context: { tripId: 'trip_guide', materializeFromTripPlan: true },
      candidates,
      constraintReportsByCandidateId: {
        balanced: {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          tripId: 'trip_guide',
          evaluatedAt: new Date().toISOString(),
          assertions: [],
          completeness: {
            roads: 'MISSING',
            weather: 'MISSING',
            hazards: 'MISSING',
            ferries: 'MISSING',
            openingHours: 'MISSING',
          },
          overallStatus: 'UNVERIFIED',
          degraded: false,
          degradedReasons: [],
        },
        faithful: {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          tripId: 'trip_guide',
          evaluatedAt: new Date().toISOString(),
          assertions: [],
          completeness: {
            roads: 'MISSING',
            weather: 'MISSING',
            hazards: 'MISSING',
            ferries: 'MISSING',
            openingHours: 'MISSING',
          },
          overallStatus: 'UNVERIFIED',
          degraded: false,
          degradedReasons: [],
        },
      },
    });

    expect(baseCandidateId).toBe('original');
    expect(workspace.repairCandidates).toHaveLength(2);
    expect(workspace.repairCandidates[0].proposedOperations[0]?.kind).toBe('ADD_ITEM');
    expect(workspace.loadAssessments).toHaveLength(2);
  });
});

describe('FullPlanSelectionService', () => {
  it('returns DecisionRecord from DecisionCore.finalize', async () => {
    const candidates: DecisionCandidate[] = [
      {
        candidateId: 'balanced',
        label: '平衡',
        source: 'LEGACY_TRIP_PLANNING',
        plan: minimalPlan('b'),
        utilityHint: 0.85,
        legacyVariant: {
          id: 'balanced',
          score: {
            total: 0.85,
            breakdown: {
              satisfaction: 0.9,
              violationRisk: 0.1,
              robustness: 0.8,
              cost: 0.2,
            },
          },
          tradeoffs: [],
          feasibility: { isValid: true, violations: 0 },
        },
        createdAt: new Date().toISOString(),
      },
    ];

    const legacyAdapter = {
      generateCandidates: jest.fn().mockResolvedValue(candidates),
    };
    const gateway = {
      evaluateCandidate: jest.fn().mockResolvedValue({
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId: 'trip_1',
        evaluatedAt: new Date().toISOString(),
        assertions: [],
        completeness: {
          roads: 'COMPLETE',
          weather: 'COMPLETE',
          hazards: 'COMPLETE',
          ferries: 'COMPLETE',
          openingHours: 'MISSING',
        },
        overallStatus: 'FEASIBLE',
        degraded: false,
        degradedReasons: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FullPlanSelectionService,
        DecisionCoreService,
        ObjectiveSemanticsRegistry,
        CanonicalSolutionPostValidatorService,
        LegacyFrozenStrategy,
        CpSatLexicographicStrategy,
        {
          provide: WorldStateSnapshotService,
          useValue: {
            capture: jest.fn().mockResolvedValue({
              snapshotId: 'ws_trip_1',
              snapshot: {
                schemaId: 'tripnara.canonical_world_state_snapshot@v1',
                snapshotId: 'ws_trip_1',
                tripId: 'trip_1',
                revision: '1',
                createdAt: new Date().toISOString(),
                weather: [],
                roads: [],
                hazards: [],
                ferries: [],
                poiStates: [],
                travelMatrix: { matrixId: 'm1', entries: [] },
                completeness: {
                  roads: 'COMPLETE',
                  weather: 'COMPLETE',
                  hazards: 'COMPLETE',
                  ferries: 'COMPLETE',
                  openingHours: 'MISSING',
                },
                sourceVersions: [],
              },
              dataCompletenessScore: 0.8,
            }),
          },
        },
        { provide: LegacyTripPlanningAdapter, useValue: legacyAdapter },
        { provide: ConstraintEvaluationGatewayService, useValue: gateway },
      ],
    }).compile();

    const service = module.get(FullPlanSelectionService);
    const worldState = {
      context: {
        tripId: 'trip_1',
        destination: 'IS',
        startDate: '2026-07-01',
        durationDays: 1,
        travelModeDefault: 'drive',
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
      physical: { roadStates: [], hazardZones: [], ferryStates: [] },
    } as TripWorldState;

    const result = await service.selectRecommendedPlan({
      worldState,
      context: { tripId: 'trip_1', retainAllCandidates: true },
    });

    expect(result.record.selectedCandidateId).toBe('balanced');
    expect(result.recommendedPlan).toBeDefined();
    expect(result.snapshotId).toBe('ws_trip_1');
    expect(result.shadowComparison?.canonicalSelectedId).toBe('balanced');
  });

  it('records optimization shadow when DECISION_RUNTIME_MODE=SHADOW', async () => {
    const prev = process.env.DECISION_RUNTIME_MODE;
    process.env.DECISION_RUNTIME_MODE = 'SHADOW';

    try {
      const candidates: DecisionCandidate[] = [
        {
          candidateId: 'balanced',
          label: '平衡',
          source: 'LEGACY_TRIP_PLANNING',
          plan: minimalPlan('b'),
          utilityHint: 0.85,
          createdAt: new Date().toISOString(),
        },
      ];

      const gateway = {
        evaluateCandidate: jest.fn().mockResolvedValue({
          schemaId: 'tripnara.canonical_constraint_report@v1',
          tripId: 'trip_1',
          evaluatedAt: new Date().toISOString(),
          assertions: [],
          completeness: {
            roads: 'COMPLETE',
            weather: 'COMPLETE',
            hazards: 'COMPLETE',
            ferries: 'COMPLETE',
            openingHours: 'MISSING',
          },
          overallStatus: 'FEASIBLE',
          degraded: false,
          degradedReasons: [],
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FullPlanSelectionService,
          DecisionCoreService,
          ObjectiveSemanticsRegistry,
          CanonicalSolutionPostValidatorService,
          LegacyFrozenStrategy,
          CpSatLexicographicStrategy,
          OptimizationShadowMetricsCollector,
          ShadowObservabilityService,
          {
            provide: WorldStateSnapshotService,
            useValue: {
              capture: jest.fn().mockResolvedValue({
                snapshotId: 'ws_shadow',
                snapshot: {
                  schemaId: 'tripnara.canonical_world_state_snapshot@v1',
                  snapshotId: 'ws_shadow',
                  tripId: 'trip_1',
                  revision: '1',
                  createdAt: new Date().toISOString(),
                  weather: [],
                  roads: [],
                  hazards: [],
                  ferries: [],
                  poiStates: [],
                  travelMatrix: { matrixId: 'm1', entries: [] },
                  completeness: {
                    roads: 'COMPLETE',
                    weather: 'COMPLETE',
                    hazards: 'COMPLETE',
                    ferries: 'COMPLETE',
                    openingHours: 'MISSING',
                  },
                  sourceVersions: [],
                },
                dataCompletenessScore: 1,
              }),
            },
          },
          {
            provide: LegacyTripPlanningAdapter,
            useValue: { generateCandidates: jest.fn().mockResolvedValue(candidates) },
          },
          { provide: ConstraintEvaluationGatewayService, useValue: gateway },
        ],
      }).compile();

      const service = module.get(FullPlanSelectionService);
      const worldState = {
        context: {
          tripId: 'trip_1',
          destination: 'IS',
          startDate: '2026-07-01',
          durationDays: 1,
          travelModeDefault: 'drive',
          preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
        },
        candidatesByDate: {},
        signals: { lastUpdatedAt: new Date().toISOString() },
        physical: { roadStates: [], hazardZones: [], ferryStates: [] },
      } as TripWorldState;

      const result = await service.selectRecommendedPlan({
        worldState,
        context: { tripId: 'trip_1', retainAllCandidates: true },
      });

      expect(result.shadowOptimizationResult?.solverMetadata.strategyId).toBe(
        'cp-sat-lexicographic',
      );
      expect(result.optimizationResult).toBeUndefined();
      expect(result.optimizationShadow).toBeDefined();
      expect(result.optimizationShadow?.shadowStrategyId).toBe('cp-sat-lexicographic');
      expect(result.optimizationShadow?.inputFingerprint.candidateSetHash).toBeTruthy();
      expect(result.optimizationShadow?.divergence.explainability.length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.DECISION_RUNTIME_MODE;
      else process.env.DECISION_RUNTIME_MODE = prev;
    }
  });
});
