import { projectOntologyIssuesFromWorldFacts } from '../../travel-ontology/projections/ontology-issues.projection';
import { getOntologyDecisionScenario } from '../../harness/evals/fixtures/ontology-world-model/ontology-decision-scenarios.registry';

describe('Exploration Ontology entry eligibility harness', () => {
  it('ONT-SCENARIO-004 projects consumer issues with ontology: prefix', () => {
    const fixture = getOntologyDecisionScenario('ONT-SCENARIO-004-VISA-UNCONFIRMED')!;

    const issues = projectOntologyIssuesFromWorldFacts({
      tripId: fixture.snapshot.identity.tripId!,
      worldFacts: fixture.snapshot.world.facts,
    });

    expect(issues.some((i) => i.issueId === 'ontology:ENTRY_ELIGIBILITY_UNKNOWN')).toBe(true);
    expect(issues.some((i) => i.issueId === 'ontology:VISA_STATUS_UNCONFIRMED')).toBe(true);
    expect(issues.filter((i) => i.severity === 'BLOCK').length).toBeGreaterThan(0);
  });
});
