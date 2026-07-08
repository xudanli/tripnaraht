import { parseTravelWorldFactsFromSnapshot } from '../../../travel-ontology/adapters/snapshot-world-fact.adapter';
import { evaluateOntologyConstraints } from '../../../travel-ontology/evaluators/ontology-constraint.evaluator';
import type { OntologyDecisionScenarioFixture } from '../fixtures/ontology-world-model/ontology-decision-scenario.types';
import type { TravelContextHarnessAssertion } from '../../protocol/harness-case.types';

/** 断言 §24 场景的预期 Ontology 约束码与严重级别 */
export function assertOntologyScenarioConstraints(
  fixture: OntologyDecisionScenarioFixture,
): TravelContextHarnessAssertion[] {
  const facts = parseTravelWorldFactsFromSnapshot(fixture.snapshot.world.facts);
  const evaluation = evaluateOntologyConstraints(facts);
  const assertions: TravelContextHarnessAssertion[] = [];

  for (const expected of fixture.definition.expectedConstraints) {
    const match = evaluation.results.find((r) => r.code === expected.code);
    assertions.push({
      name: `ontology_constraint_${expected.code}`,
      pass: Boolean(match) && match!.severity === expected.severity,
      expected: { code: expected.code, severity: expected.severity },
      actual: match ?? null,
      message: match
        ? undefined
        : `Expected ${expected.code} (${expected.severity}), got ${evaluation.results.map((r) => r.code).join(', ') || 'none'}`,
    });
  }

  if (fixture.definition.blocksExecutability) {
    const hasBlock = evaluation.results.some((r) => r.severity === 'BLOCK');
    assertions.push({
      name: 'blocks_executability',
      pass: hasBlock,
      expected: true,
      actual: hasBlock,
    });
  }

  return assertions;
}
