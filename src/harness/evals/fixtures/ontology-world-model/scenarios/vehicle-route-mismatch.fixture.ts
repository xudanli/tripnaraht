/**
 * §24 场景一：车辆与路线不匹配
 * 2WD + F 路 + 合同禁止 F 路 → BLOCK
 */

import { buildIcelandPlanningContextFixture } from '../../contexts/iceland-planning.fixture';
import { projectTravelWorldFactsToSnapshot } from '../../../../../travel-ontology/contracts';
import type { OntologyDecisionScenarioFixture } from '../ontology-decision-scenario.types';
import { buildOntologyFact, TRAVEL_WORLD_PREDICATES } from '../ontology-scenario.util';

export function buildVehicleRouteMismatchScenario(): OntologyDecisionScenarioFixture {
  const inputFacts = [
    buildOntologyFact({
      subjectType: 'RentalVehicle',
      subjectId: 'veh_yaris_2wd',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      value: '2WD',
      scope: { tripId: 'trip_iceland_fixture', country: 'IS' },
      authorityLevel: 'USER_BOOKING',
      source: { provider: 'rental_order', contractVersion: 'v2026-08' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'RentalContract',
      subjectId: 'contract_fixture',
      predicate: TRAVEL_WORLD_PREDICATES.PROHIBITED_ROAD_CLASS,
      value: 'F_ROAD',
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'USER_BOOKING',
      source: { provider: 'rental_contract_pdf' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'RouteSegment',
      subjectId: 'seg_f208',
      predicate: TRAVEL_WORLD_PREDICATES.REQUIRED_VEHICLE_CAPABILITY,
      value: '4WD',
      scope: { country: 'IS', region: 'highlands' },
      authorityLevel: 'OFFICIAL_OPERATOR',
      source: { provider: 'road-is' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.95,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
  ];

  const snapshot = buildIcelandPlanningContextFixture({
    plan: {
      effectivePlan: {
        versionId: 'pv_f208_plan',
        dayCount: 5,
        itemCount: 12,
        hasEffectivePlan: true,
        executabilityStatus: 'BLOCKED',
      },
      selectedRouteId: 'route_f208_highlands',
    },
    world: {
      facts: projectTravelWorldFactsToSnapshot(inputFacts),
      dataCompletenessScore: 0.85,
      lastRefreshedAt: '2026-07-05T10:00:00.000Z',
    },
    decisions: {
      open: [
        {
          decisionId: 'prob_vehicle_route_mismatch',
          problemType: 'VEHICLE_ROUTE_MISMATCH',
          title: '车辆与 F208 路线要求不匹配',
          urgency: 'HIGH',
          status: 'DETECTED',
          authorizationRequired: false,
        },
      ],
      counts: { total: 1, blocking: 1, actionable: 1 },
    },
  });

  return {
    definition: {
      caseId: 'ONT-SCENARIO-001-VEHICLE-ROUTE-MISMATCH',
      title: '2WD + F-road + contract prohibition → BLOCK',
      description:
        '计划包含 F 路，当前车辆为 2WD，租车合同禁止进入 F 路。应 BLOCK 可执行性并建议换车或换线。',
      scenarioRef: '§24.1',
      phase: 'P0',
      tags: ['iceland', 'f-road', 'vehicle', 'rental-contract'],
      inputFacts,
      expectedConstraints: [
        { severity: 'BLOCK', code: 'VEHICLE_CAPABILITY_MISMATCH', affectedSubjectIds: ['seg_f208'] },
        { severity: 'BLOCK', code: 'RENTAL_CONTRACT_ROAD_PROHIBITION', affectedSubjectIds: ['contract_fixture'] },
      ],
      blocksExecutability: true,
      allowsEditing: true,
    },
    snapshot,
  };
}
