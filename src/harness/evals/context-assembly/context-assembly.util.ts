import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import type { TravelContextHarnessAssertion } from '../../protocol/harness-case.types';
import { harnessAssert } from '../../protocol/run-travel-context-harness.util';

/** CONTEXT-ASSEMBLY-001 — Snapshot correctly assembles intent, contract, plan, decisions */
export function assertContextAssembly001(
  snapshot: TravelContextSnapshot,
  expected: {
    destinationCode?: string;
    constraintIds?: string[];
    minOpenDecisions?: number;
  } = {},
): TravelContextHarnessAssertion[] {
  const assertions: TravelContextHarnessAssertion[] = [];

  assertions.push(
    harnessAssert({
      name: 'intent_destination_present',
      pass: Boolean(snapshot.intent.destination.countryCode ?? snapshot.intent.destination.label),
      expected: true,
      actual: snapshot.intent.destination,
    }),
  );

  if (expected.destinationCode) {
    assertions.push(
      harnessAssert({
        name: 'intent_destination_code',
        pass: snapshot.intent.destination.countryCode === expected.destinationCode,
        expected: expected.destinationCode,
        actual: snapshot.intent.destination.countryCode,
      }),
    );
  }

  if (expected.constraintIds?.length) {
    const ids = new Set(snapshot.contract.constraints.map((c) => c.id));
    for (const id of expected.constraintIds) {
      assertions.push(
        harnessAssert({
          name: `contract_has_constraint_${id}`,
          pass: ids.has(id),
          expected: id,
          actual: [...ids],
        }),
      );
    }
  }

  assertions.push(
    harnessAssert({
      name: 'single_effective_plan_truth',
      pass:
        !snapshot.plan.effectivePlan.hasEffectivePlan ||
        Boolean(snapshot.plan.effectivePlan.versionId),
      expected: 'versionId when hasEffectivePlan',
      actual: snapshot.plan.effectivePlan,
    }),
  );

  assertions.push(
    harnessAssert({
      name: 'plan_version_matches_bindings',
      pass:
        !snapshot.meta.bindings.effectivePlanVersionId ||
        snapshot.meta.bindings.effectivePlanVersionId ===
          snapshot.plan.effectivePlan.versionId,
      expected: snapshot.meta.bindings.effectivePlanVersionId,
      actual: snapshot.plan.effectivePlan.versionId,
    }),
  );

  assertions.push(
    harnessAssert({
      name: 'decisions_count_matches_open_array',
      pass: snapshot.decisions.open.length === snapshot.decisions.counts.total,
      expected: snapshot.decisions.counts.total,
      actual: snapshot.decisions.open.length,
    }),
  );

  if (expected.minOpenDecisions !== undefined) {
    assertions.push(
      harnessAssert({
        name: 'min_open_decisions',
        pass: snapshot.decisions.counts.total >= expected.minOpenDecisions,
        expected: expected.minOpenDecisions,
        actual: snapshot.decisions.counts.total,
      }),
    );
  }

  for (const fact of snapshot.world.facts) {
    assertions.push(
      harnessAssert({
        name: `world_fact_${fact.factId}_has_observed_at`,
        pass: Boolean(fact.observedAt),
        expected: 'observedAt',
        actual: fact.observedAt,
      }),
    );
  }

  return assertions;
}
