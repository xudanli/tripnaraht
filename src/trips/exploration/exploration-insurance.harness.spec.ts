import { evaluateOntologyConstraints } from '../../travel-ontology/evaluators/ontology-constraint.evaluator';
import { projectExplorationInsuranceTier } from '../../travel-ontology/adapters/exploration-insurance-tier.adapter';
import { TRAVEL_WORLD_PREDICATES } from '../../travel-ontology/contracts/travel-world-fact.types';
import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';

describe('Exploration insurance ingest harness (ONT-SCENARIO-002 alignment)', () => {
  it('STANDARD tier + river crossing → insurance gap constraints', () => {
    const tier = projectExplorationInsuranceTier('STANDARD')!;
    const facts: TravelWorldFact[] = [
      {
        schemaId: 'tripnara.travel_world_fact@v1',
        factId: 'f_covers',
        subjectType: 'InsurancePolicy',
        subjectId: 'policy_1',
        predicate: TRAVEL_WORLD_PREDICATES.COVERS_DAMAGE_CAUSE,
        value: tier.coveredCauses,
        scope: { tripId: 'trip_1' },
        authorityLevel: 'USER_DECLARATION',
        source: { provider: 'exploration' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 0.8,
        freshness: 'FRESH',
        verificationStatus: 'UNVERIFIED',
      },
      {
        schemaId: 'tripnara.travel_world_fact@v1',
        factId: 'f_excludes',
        subjectType: 'InsurancePolicy',
        subjectId: 'policy_1',
        predicate: TRAVEL_WORLD_PREDICATES.EXCLUDES_DAMAGE_CAUSE,
        value: tier.excludedCauses,
        scope: { tripId: 'trip_1' },
        authorityLevel: 'USER_DECLARATION',
        source: { provider: 'exploration' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 0.7,
        freshness: 'FRESH',
        verificationStatus: 'UNVERIFIED',
      },
      {
        schemaId: 'tripnara.travel_world_fact@v1',
        factId: 'f_river',
        subjectType: 'RouteSegment',
        subjectId: 'seg_river_crossing',
        predicate: 'route.hasRiverCrossing',
        value: true,
        scope: { tripId: 'trip_1' },
        authorityLevel: 'OFFICIAL_OPERATOR',
        source: { provider: 'iceland_pack' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 0.9,
        freshness: 'FRESH',
        verificationStatus: 'VERIFIED',
      },
    ];

    const { results } = evaluateOntologyConstraints(facts);
    expect(results.some((r) => r.code === 'INSURANCE_WATER_CROSSING_GAP')).toBe(true);
    expect(results.some((r) => r.code === 'INSURANCE_UNDERCARRIAGE_UNKNOWN')).toBe(true);
  });
});
