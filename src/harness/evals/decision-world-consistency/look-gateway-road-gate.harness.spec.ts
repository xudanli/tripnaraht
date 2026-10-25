/**
 * ConstraintEvaluationGateway merges DecisionTickRoadGateProvider assertions.
 *
 * Proves production Gate path (not provider-in-isolation):
 *   binding store → DecisionTickRoadGateProvider → gateway.evaluatePlan
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintEvaluationGatewayService } from '../../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from '../../../decision-runtime/constraints/failure-policy.service';
import { LegacyConstraintCheckerAdapter } from '../../../decision-runtime/constraints/providers/legacy-checker.provider';
import { GuardianConstraintProvider } from '../../../decision-runtime/constraints/providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from '../../../decision-runtime/constraints/providers/destination-pack.provider';
import { OntologyConstraintProvider } from '../../../decision-runtime/constraints/providers/ontology-constraint.provider';
import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { DecisionTickRoadGateProvider } from '../../../trips/decision/world-consistency/decision-tick-road-gate.provider';
import { materializeLookRoadAuthorityForDecisionTick } from '../../../trips/decision/world-consistency/look-road-authority-bridge';
import { buildLookRoadSuspectedClosedHint } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';

const TRIP = 'trip_gateway_road_gate';

function drivePlan(): TripPlan {
  return {
    version: 'test@v1',
    createdAt: new Date().toISOString(),
    tripId: TRIP,
    days: [
      {
        day: 1,
        date: '2026-07-17',
        timeSlots: [
          {
            id: 'slot_1',
            time: '09:00',
            title: 'F208 drive',
            type: 'transport',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64.0, lng: -19.0 },
              to: { lat: 64.1, lng: -19.1 },
              durationMin: 60,
            },
          },
        ],
      },
    ],
  };
}

function worldWithRoadsLoaded(
  status: 'OPEN' | 'CLOSED',
): TripWorldState {
  return {
    context: {
      tripId: TRIP,
      destination: 'IS',
      startDate: '2026-07-17',
      durationDays: 1,
      travelModeDefault: 'drive',
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {},
    signals: { lastUpdatedAt: new Date().toISOString() },
    physical: {
      roadStates: [{ roadId: 'F208', status }],
      hazardZones: [],
      ferryStates: [],
    },
  } as TripWorldState;
}

function hint() {
  return buildLookRoadSuspectedClosedHint({
    lookObservationId: 'obs_gw',
    roadId: 'F208',
    tripId: TRIP,
    suspectedAt: '2026-07-17T12:00:00.000Z',
  });
}

describe('Gateway ← DecisionTickRoadGate (P0-1)', () => {
  let gateway: ConstraintEvaluationGatewayService;
  let bindingStore: DecisionTickRoadBindingStore;

  beforeEach(async () => {
    bindingStore = new DecisionTickRoadBindingStore();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConstraintEvaluationGatewayService,
        ConstraintFailurePolicyService,
        {
          provide: LegacyConstraintCheckerAdapter,
          useValue: { evaluate: jest.fn().mockResolvedValue([]) },
        },
        GuardianConstraintProvider,
        DestinationPackConstraintProvider,
        OntologyConstraintProvider,
        { provide: DecisionTickRoadBindingStore, useValue: bindingStore },
        DecisionTickRoadGateProvider,
      ],
    }).compile();

    gateway = module.get(ConstraintEvaluationGatewayService);
  });

  it('A: authority CLOSED → Gate BLOCK → overall INFEASIBLE', async () => {
    bindingStore.put(
      materializeLookRoadAuthorityForDecisionTick({
        tickId: 'tick_gw_a',
        lookHint: hint(),
        authority: {
          kind: 'RESOLVED',
          status: 'CLOSED',
          observedAt: new Date().toISOString(),
          sourceProvider: 'vegagerdin_gagnaveita',
          authority: 'OFFICIAL',
          evidenceId: 'ev_gw_a',
          version: 'gwA',
        },
      }),
    );

    const report = await gateway.evaluatePlan({
      tripId: TRIP,
      plan: drivePlan(),
      worldState: worldWithRoadsLoaded('CLOSED'),
      dataAvailability: { roads: 'LOADED' },
    });

    expect(
      report.assertions.some(
        (a) =>
          a.reasonCode === 'DECISION_TICK_ROAD_CLOSED' && a.status === 'BLOCK',
      ),
    ).toBe(true);
    expect(report.overallStatus).toBe('INFEASIBLE');
  });

  it('B: authority OPEN → Gate PASS (no BLOCK from tick road)', async () => {
    bindingStore.put(
      materializeLookRoadAuthorityForDecisionTick({
        tickId: 'tick_gw_b',
        lookHint: hint(),
        authority: {
          kind: 'RESOLVED',
          status: 'OPEN',
          observedAt: new Date().toISOString(),
          sourceProvider: 'vegagerdin_gagnaveita',
          authority: 'OFFICIAL',
          evidenceId: 'ev_gw_b',
          version: 'gwB',
        },
      }),
    );

    const report = await gateway.evaluatePlan({
      tripId: TRIP,
      plan: drivePlan(),
      worldState: worldWithRoadsLoaded('OPEN'),
      dataAvailability: { roads: 'LOADED' },
    });

    expect(
      report.assertions.some(
        (a) =>
          a.reasonCode === 'DECISION_TICK_ROAD_OPEN' && a.status === 'PASS',
      ),
    ).toBe(true);
    expect(
      report.assertions.some((a) => a.reasonCode === 'DECISION_TICK_ROAD_CLOSED'),
    ).toBe(false);
    expect(report.overallStatus).not.toBe('INFEASIBLE');
  });

  it('C: authority UNAVAILABLE → REQUIRES_VERIFICATION → UNVERIFIED', async () => {
    bindingStore.put(
      materializeLookRoadAuthorityForDecisionTick({
        tickId: 'tick_gw_c',
        lookHint: hint(),
        authority: {
          kind: 'UNAVAILABLE',
          attemptedAt: new Date().toISOString(),
          reason: 'timeout',
          evidenceId: 'ev_gw_c',
          version: 'gwC',
        },
      }),
    );

    const report = await gateway.evaluatePlan({
      tripId: TRIP,
      plan: drivePlan(),
      worldState: worldWithRoadsLoaded('OPEN'),
      dataAvailability: { roads: 'LOADED' },
    });

    expect(
      report.assertions.some(
        (a) =>
          a.reasonCode === 'DECISION_TICK_ROAD_UNVERIFIED' &&
          a.status === 'REQUIRES_VERIFICATION',
      ),
    ).toBe(true);
    expect(report.overallStatus).toBe('UNVERIFIED');
  });
});
