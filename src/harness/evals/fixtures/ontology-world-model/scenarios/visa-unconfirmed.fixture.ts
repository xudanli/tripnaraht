/**
 * §24 场景四：签证状态未确认
 * 需要签证 + 无有效签证证据 → 阻止 READY，不阻止编辑
 */

import { buildIcelandPlanningContextFixture } from '../../contexts/iceland-planning.fixture';
import { projectTravelWorldFactsToSnapshot } from '../../../../../travel-ontology/contracts';
import type { OntologyDecisionScenarioFixture } from '../ontology-decision-scenario.types';
import { buildOntologyFact, TRAVEL_WORLD_PREDICATES } from '../ontology-scenario.util';

export function buildVisaUnconfirmedScenario(): OntologyDecisionScenarioFixture {
  const inputFacts = [
    buildOntologyFact({
      subjectType: 'Traveler',
      subjectId: 'traveler_cn_passport',
      predicate: 'immigration.nationality',
      value: 'CN',
      scope: { tripId: 'trip_iceland_fixture', travelerId: 'traveler_cn_passport' },
      authorityLevel: 'USER_DECLARATION',
      source: { provider: 'user_profile' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'Traveler',
      subjectId: 'traveler_cn_passport',
      predicate: TRAVEL_WORLD_PREDICATES.VISA_REQUIRED,
      value: true,
      scope: { country: 'IS' },
      authorityLevel: 'GOVERNMENT',
      source: { provider: 'schengen_entry_rules' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.99,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
    }),
    buildOntologyFact({
      subjectType: 'Traveler',
      subjectId: 'traveler_cn_passport',
      predicate: TRAVEL_WORLD_PREDICATES.ENTRY_ELIGIBILITY,
      value: { status: 'UNKNOWN', visaRequired: true, missingDocuments: ['SCHENGEN_VISA'] },
      scope: { tripId: 'trip_iceland_fixture' },
      authorityLevel: 'MODEL_INFERENCE',
      source: { provider: 'entry_eligibility_engine' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.5,
      freshness: 'FRESH',
      verificationStatus: 'UNVERIFIED',
    }),
  ];

  const snapshot = buildIcelandPlanningContextFixture({
    plan: {
      effectivePlan: {
        versionId: 'pv_visa_pending',
        dayCount: 5,
        itemCount: 8,
        hasEffectivePlan: true,
        executabilityStatus: 'UNKNOWN',
      },
    },
    world: {
      facts: projectTravelWorldFactsToSnapshot(inputFacts),
      dataCompletenessScore: 0.6,
    },
  });

  return {
    definition: {
      caseId: 'ONT-SCENARIO-004-VISA-UNCONFIRMED',
      title: 'Visa required but status unknown → block READY, allow editing',
      description:
        '行程日期已确定，护照需申根签证，系统未确认有效签证。应阻止 READY/可预订确认，允许继续编辑。',
      scenarioRef: '§24.4',
      phase: 'P0',
      tags: ['immigration', 'visa', 'schengen'],
      inputFacts,
      expectedConstraints: [
        { severity: 'BLOCK', code: 'ENTRY_ELIGIBILITY_UNKNOWN' },
        { severity: 'MISSING_EVIDENCE', code: 'VISA_STATUS_UNCONFIRMED' },
      ],
      blocksExecutability: true,
      allowsEditing: true,
    },
    snapshot,
  };
}
