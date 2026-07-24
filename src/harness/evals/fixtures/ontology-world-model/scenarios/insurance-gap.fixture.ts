/**
 * §24 场景二：保险存在缺口
 * 碰撞+碎石已覆盖，底盘/涉水未确认 + 路线涉水风险 → WARNING / MISSING_EVIDENCE
 */

import { buildIcelandPlanningContextFixture } from '../../contexts/iceland-planning.fixture';
import { projectTravelWorldFactsToSnapshot } from '../../../../../travel-ontology/contracts';
import type { OntologyDecisionScenarioFixture } from '../ontology-decision-scenario.types';
import { buildOntologyFact, TRAVEL_WORLD_PREDICATES } from '../ontology-scenario.util';

export function buildInsuranceGapScenario(): OntologyDecisionScenarioFixture {
  const inputFacts = [
    buildOntologyFact({
      subjectType: 'InsurancePolicy',
      subjectId: 'policy_fixture',
      predicate: TRAVEL_WORLD_PREDICATES.COVERS_DAMAGE_CAUSE,
      value: ['collision', 'gravel'],
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'USER_BOOKING',
      source: { provider: 'insurance_contract_pdf' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.9,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'InsurancePolicy',
      subjectId: 'policy_fixture',
      predicate: TRAVEL_WORLD_PREDICATES.EXCLUDES_DAMAGE_CAUSE,
      value: ['waterCrossing'],
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'SUPPLIER_CONTRACT',
      source: { provider: 'insurance_terms_default' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.7,
      freshness: 'STALE',
      verificationStatus: 'UNVERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'RouteSegment',
      subjectId: 'seg_river_crossing',
      predicate: 'route.hasRiverCrossing',
      value: true,
      scope: { country: 'IS' },
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
        versionId: 'pv_river_route',
        dayCount: 5,
        itemCount: 10,
        hasEffectivePlan: true,
        executabilityStatus: 'UNKNOWN',
      },
      selectedRouteId: 'route_river_crossing',
    },
    world: {
      facts: projectTravelWorldFactsToSnapshot(inputFacts),
      dataCompletenessScore: 0.7,
    },
  });

  return {
    definition: {
      caseId: 'ONT-SCENARIO-002-INSURANCE-GAP',
      title: 'Undercarriage/water crossing coverage unconfirmed → WARNING',
      description:
        '保险覆盖碰撞和碎石，底盘和涉水未确认；计划路线存在涉水风险。应 MISSING_EVIDENCE 或 WARNING。',
      scenarioRef: '§24.2',
      phase: 'P0',
      tags: ['iceland', 'insurance', 'water-crossing'],
      inputFacts,
      expectedConstraints: [
        { severity: 'MISSING_EVIDENCE', code: 'INSURANCE_UNDERCARRIAGE_UNKNOWN' },
        { severity: 'WARNING', code: 'INSURANCE_WATER_CROSSING_GAP' },
      ],
      blocksExecutability: false,
      allowsEditing: true,
    },
    snapshot,
  };
}
