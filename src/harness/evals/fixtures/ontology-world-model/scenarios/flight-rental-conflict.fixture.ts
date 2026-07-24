/**
 * §24 场景五：航班与取车柜台冲突
 * 航班晚于柜台营业 + 订单无夜间取车 → NEEDS_ACTION / BLOCK booking confirm
 */

import { buildIcelandPlanningContextFixture } from '../../contexts/iceland-planning.fixture';
import { projectTravelWorldFactsToSnapshot } from '../../../../../travel-ontology/contracts';
import type { OntologyDecisionScenarioFixture } from '../ontology-decision-scenario.types';
import { buildOntologyFact } from '../ontology-scenario.util';

export function buildFlightRentalCounterConflictScenario(): OntologyDecisionScenarioFixture {
  const inputFacts = [
    buildOntologyFact({
      subjectType: 'Flight',
      subjectId: 'flight_kef_arrival',
      predicate: 'transport.scheduledArrival',
      value: '2026-08-01T23:30:00.000Z',
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'USER_BOOKING',
      source: { provider: 'flight_pnr' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.95,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'RentalContract',
      subjectId: 'contract_kef_counter',
      predicate: 'rental.counterHours',
      value: { open: '08:00', close: '18:00', timezone: 'Atlantic/Reykjavik' },
      scope: { country: 'IS' },
      authorityLevel: 'SUPPLIER_CONTRACT',
      source: { provider: 'rental_order' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'RentalContract',
      subjectId: 'contract_kef_counter',
      predicate: 'rental.afterHoursPickupConfirmed',
      value: false,
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'USER_BOOKING',
      source: { provider: 'rental_order' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
  ];

  const snapshot = buildIcelandPlanningContextFixture({
    intent: {
      primaryGoal: '冰岛抵达即取车',
      destination: { status: 'CONFIRMED', countryCode: 'IS', label: 'Iceland' },
      dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
    },
    world: {
      facts: projectTravelWorldFactsToSnapshot(inputFacts),
      dataCompletenessScore: 0.8,
    },
    decisions: {
      open: [
        {
          decisionId: 'prob_rental_pickup_window',
          problemType: 'RENTAL_PICKUP_CONFLICT',
          title: '航班到达晚于租车柜台营业时间',
          urgency: 'HIGH',
          status: 'DETECTED',
          authorizationRequired: true,
        },
      ],
      counts: { total: 1, blocking: 1, actionable: 1 },
    },
  });

  return {
    definition: {
      caseId: 'ONT-SCENARIO-005-FLIGHT-RENTAL-CONFLICT',
      title: 'Flight arrival after rental counter close → NEEDS_ACTION',
      description:
        '航班预计到达晚于租车柜台营业时间，订单未确认夜间取车。需联系租车公司、调整取车或增加机场住宿。',
      scenarioRef: '§24.5',
      phase: 'P0',
      tags: ['iceland', 'flight', 'rental', 'pickup-window'],
      inputFacts,
      expectedConstraints: [
        { severity: 'BLOCK', code: 'RENTAL_PICKUP_WINDOW_CONFLICT' },
        { severity: 'WARNING', code: 'AFTER_HOURS_PICKUP_UNCONFIRMED' },
      ],
      blocksExecutability: true,
      allowsEditing: true,
    },
    snapshot,
  };
}
