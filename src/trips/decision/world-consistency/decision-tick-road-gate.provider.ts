/**
 * Gate provider: read DecisionTickRoadBindingStore → ConstraintAssertion[].
 */

import { Injectable, Optional } from '@nestjs/common';
import type { ConstraintAssertion } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import { DecisionTickRoadBindingStore } from './decision-tick-road-binding.store';
import { buildDecisionTickRoadGateAssertions } from './build-decision-tick-road-gate-assertions.util';
import { applyRoadTickFreshness } from './decision-tick-freshness.util';

@Injectable()
export class DecisionTickRoadGateProvider {
  constructor(
    @Optional() private readonly bindingStore?: DecisionTickRoadBindingStore,
  ) {}

  evaluate(input: { tripId: string }): ConstraintAssertion[] {
    if (!this.bindingStore) return [];
    const m = this.bindingStore.getLatest(input.tripId);
    if (!m) return [];
    return buildDecisionTickRoadGateAssertions(applyRoadTickFreshness(m));
  }
}
