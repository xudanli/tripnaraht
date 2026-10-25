/**
 * Parity: same physical fixture → GATE_EVAL BLOCK and Gateway INFEASIBLE via Policy Lab.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GateEvalExecutorService } from '../../agent/execution/gate-eval-executor.service';
import { TripContextExtractorService } from '../../agent/execution/shared/trip-context-extractor.service';
import { PolicyLabConflictMatrixService } from '../../domain/policy-lab/policy-lab-conflict-matrix.service';
import { PolicyLabConstraintProvider } from './providers/policy-lab-constraint.provider';
import { ConstraintEvaluationGatewayService } from './constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from './failure-policy.service';
import { LegacyConstraintCheckerAdapter } from './providers/legacy-checker.provider';
import { GuardianConstraintProvider } from './providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from './providers/destination-pack.provider';
import { OntologyConstraintProvider } from './providers/ontology-constraint.provider';
import type { TripPlan } from '../../trips/decision/plan-model';
import type { TripWorldState } from '../../trips/decision/world-model';

const DB_RULE = {
  ruleId: 'db_froad_visibility_block_v1',
  enabled: true,
  params: {
    kind: 'CONFLICT_MATRIX',
    conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
    effect: 'HARD_BLOCK',
    priority: 120,
  },
  updatedAt: new Date(),
};

const prismaMock = {
  physicalDomainConstraintConfig: {
    findMany: jest.fn().mockResolvedValue([DB_RULE]),
  },
};

function buildPhysicalWorld() {
  return {
    roadStates: [{ metadata: { segmentType: 'F_ROAD' } }],
    prefetched_evidence: [
      {
        kind: 'environment_overrides_v1',
        overrides: {
          weather: {
            forecastSeries: [
              {
                start: '2026-06-01T00:00:00.000Z',
                end: '2026-06-01T06:00:00.000Z',
                visibility_m: 80,
                confidenceScore: 0.9,
              },
            ],
          },
        },
      },
    ],
  };
}

function buildDrivePlan(): TripPlan {
  return {
    version: 'test@v1',
    createdAt: new Date().toISOString(),
    tripId: 'trip_parity',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 'slot_1',
            time: '09:00',
            title: 'Drive F-road',
            type: 'transport',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64.1, lng: -21.9 },
              to: { lat: 64.2, lng: -21.8 },
              durationMin: 45,
            },
          },
        ],
      },
    ],
  };
}

describe('Policy Lab GATE_EVAL ↔ Gateway parity', () => {
  it('same fixture: GATE_EVAL BLOCK and Gateway INFEASIBLE with policy-lab assertion', async () => {
    const conflictMatrix = new PolicyLabConflictMatrixService(prismaMock as any);

    const gateModule: TestingModule = await Test.createTestingModule({
      providers: [
        GateEvalExecutorService,
        TripContextExtractorService,
        { provide: PolicyLabConflictMatrixService, useValue: conflictMatrix },
      ],
    }).compile();
    const gateEval = gateModule.get(GateEvalExecutorService);

    const gatewayModule: TestingModule = await Test.createTestingModule({
      providers: [
        ConstraintEvaluationGatewayService,
        ConstraintFailurePolicyService,
        GuardianConstraintProvider,
        DestinationPackConstraintProvider,
        OntologyConstraintProvider,
        PolicyLabConstraintProvider,
        { provide: PolicyLabConflictMatrixService, useValue: conflictMatrix },
        {
          provide: LegacyConstraintCheckerAdapter,
          useValue: { evaluate: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    const gateway = gatewayModule.get(ConstraintEvaluationGatewayService);

    const physical = buildPhysicalWorld();
    const gateResult = await gateEval.execute({} as any, {
      requestId: 'parity-1',
      tripPlanRequest: {
        destination: 'Iceland',
        constraints: { vehicle_type: '2WD' },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-02' },
      },
      researchData: { world: { physical } },
    } as any);

    const worldState = {
      context: {
        tripId: 'trip_parity',
        destination: 'IS',
        startDate: '2026-06-01',
        durationDays: 1,
        travelModeDefault: 'drive',
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
      physical,
      policies: { vehicleClass: '2WD' },
    } as unknown as TripWorldState;

    const report = await gateway.evaluatePlan({
      tripId: 'trip_parity',
      plan: buildDrivePlan(),
      worldState,
      dataAvailability: { roads: 'LOADED' },
      skipLegacyChecker: true,
    });

    const gateBlocked = gateResult.gateResult.gate_result === 'BLOCK';
    const gateHit = gateResult.gateResult.violations.some((v) =>
      String(v.detail).includes('db_froad_visibility_block_v1'),
    );
    const gatewayPolicyHit = report.assertions.some(
      (a) => a.evaluator.engine === 'policy-lab' && a.evaluator.ruleId === 'db_froad_visibility_block_v1',
    );
    const gatewayInfeasible = report.overallStatus === 'INFEASIBLE';

    expect(gateBlocked).toBe(true);
    expect(gateHit).toBe(true);
    expect(gatewayPolicyHit).toBe(true);
    expect(gatewayInfeasible).toBe(true);
  });
});
