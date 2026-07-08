/**
 * Ontology World Model — §24 典型决策场景 Harness（骨架）
 *
 * 完整断言待 Constraint Gateway DEFAULT_ON + Entry/Insurance evaluators 接入后启用。
 * 当前验证：fixture 结构、事实投影、Snapshot 一致性。
 */

import {
  ONTOLOGY_DECISION_SCENARIO_REGISTRY,
  buildAllOntologyDecisionScenarioFixtures,
  getOntologyDecisionScenario,
} from '../fixtures/ontology-world-model/ontology-decision-scenarios.registry';
import { assertOntologyScenarioConstraints } from './ontology-scenario.assertions.util';
import {
  expectTravelContextHarnessPass,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';

describe('Ontology Decision Scenarios (§24) — fixture skeleton', () => {
  it('registry contains five P0 scenarios', () => {
    expect(ONTOLOGY_DECISION_SCENARIO_REGISTRY).toHaveLength(5);
    expect(ONTOLOGY_DECISION_SCENARIO_REGISTRY.every((c) => c.phase === 'P0')).toBe(true);
  });

  describe.each(ONTOLOGY_DECISION_SCENARIO_REGISTRY.map((d) => [d.caseId, d.title] as const))(
    '%s — %s',
    (caseId) => {
      it('builds valid TravelContextSnapshot with projected world facts', async () => {
        const fixture = getOntologyDecisionScenario(caseId);
        expect(fixture).toBeDefined();
        expect(fixture!.definition.inputFacts.length).toBeGreaterThan(0);
        expect(fixture!.snapshot.world.facts.length).toBeGreaterThan(0);
        expect(fixture!.snapshot.identity.tripId).toBeTruthy();

        const result = await runTravelContextHarnessCase({
          caseId,
          snapshot: fixture!.snapshot,
          run: async () => [
            {
              name: 'snapshot_has_world_facts',
              pass: fixture!.snapshot.world.facts.length === fixture!.definition.inputFacts.length,
              expected: fixture!.definition.inputFacts.length,
              actual: fixture!.snapshot.world.facts.length,
            },
            {
              name: 'expected_constraints_defined',
              pass: fixture!.definition.expectedConstraints.length > 0,
            },
          ],
        });

        expectTravelContextHarnessPass(result);
      });

      // Ontology evaluator 断言（Constraint Gateway 接入后可对照 assertion reasonCode）
      it('evaluates expected constraints via Ontology evaluator', async () => {
        const fixture = getOntologyDecisionScenario(caseId)!;
        const ontologyAssertions = assertOntologyScenarioConstraints(fixture);

        const result = await runTravelContextHarnessCase({
          caseId: `${caseId}-ONTOLOGY`,
          snapshot: fixture.snapshot,
          run: async () => ontologyAssertions,
        });

        expectTravelContextHarnessPass(result);
      });
    },
  );

  it('all fixtures have unique caseIds', () => {
    const fixtures = buildAllOntologyDecisionScenarioFixtures();
    const ids = fixtures.map((f) => f.definition.caseId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
