/**
 * §24 场景三：强风影响高顶露营车
 * 官方强风预警 + 高顶车 + 暴露路段 → WARNING 或 BLOCK（阈值依赖 Pack）
 */

import { buildIcelandPlanningContextFixture } from '../../contexts/iceland-planning.fixture';
import { projectTravelWorldFactsToSnapshot } from '../../../../../travel-ontology/contracts';
import type { OntologyDecisionScenarioFixture } from '../ontology-decision-scenario.types';
import { buildOntologyFact, TRAVEL_WORLD_PREDICATES } from '../ontology-scenario.util';

export function buildStrongWindCamperScenario(): OntologyDecisionScenarioFixture {
  const inputFacts = [
    buildOntologyFact({
      subjectType: 'RentalVehicle',
      subjectId: 'veh_camper_high_roof',
      predicate: 'mobility.vehicleClass',
      value: 'HIGH_ROOF_CAMPER',
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'USER_BOOKING',
      source: { provider: 'rental_order' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'RouteSegment',
      subjectId: 'seg_exposed_coast',
      predicate: TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL,
      value: 'ORANGE',
      scope: { country: 'IS', region: 'south_coast' },
      authorityLevel: 'GOVERNMENT',
      source: { provider: 'vedur-is', evidenceId: 'warn_2026_08_03_pm' },
      observedAt: '2026-08-03T06:00:00.000Z',
      validFrom: '2026-08-03T12:00:00.000Z',
      validTo: '2026-08-03T20:00:00.000Z',
      confidence: 0.95,
      freshness: 'LIVE',
      verificationStatus: 'VERIFIED',
      replanTrigger: true,
    }),
    buildOntologyFact({
      subjectType: 'RouteSegment',
      subjectId: 'seg_exposed_coast',
      predicate: 'route.weatherExposure',
      value: 'HIGH_WIND_EXPOSED',
      scope: { country: 'IS' },
      authorityLevel: 'MODEL_INFERENCE',
      source: { provider: 'route_exposure_model' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.85,
      freshness: 'FRESH',
      verificationStatus: 'INFERRED',
    }),
  ];

  const snapshot = buildIcelandPlanningContextFixture({
    intent: {
      primaryGoal: '冰岛南岸露营自驾',
      destination: { status: 'CONFIRMED', countryCode: 'IS', label: 'Iceland' },
      dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
    },
    world: {
      facts: projectTravelWorldFactsToSnapshot(inputFacts),
      dataCompletenessScore: 0.9,
    },
    monitoring: {
      activeCount: 1,
      items: [
        {
          itemId: 'mon_wind_south_coast',
          kind: 'weather_warning',
          status: 'ACTIVE',
          headline: '南岸强风橙色预警',
        },
      ],
      paused: false,
    },
  });

  return {
    definition: {
      caseId: 'ONT-SCENARIO-003-STRONG-WIND-CAMPER',
      title: 'Strong wind warning + high-roof camper on exposed route',
      description:
        '明天下午路线区域强风预警，高顶露营车侧风风险大。应 WARNING 或 BLOCK（取决于 Destination Pack 阈值）。',
      scenarioRef: '§24.3',
      phase: 'P0',
      tags: ['iceland', 'weather', 'wind', 'camper'],
      inputFacts,
      expectedConstraints: [
        { severity: 'WARNING', code: 'WIND_HIGH_ROOF_VEHICLE_RISK' },
      ],
      blocksExecutability: false,
      allowsEditing: true,
    },
    snapshot,
  };
}
