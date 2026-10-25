/**
 * Gate provider: read DecisionTickPoiBindingStore → ConstraintAssertion[].
 */

import { Injectable, Optional } from '@nestjs/common';
import type { ConstraintAssertion } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import { DecisionTickPoiBindingStore } from './decision-tick-poi-binding.store';
import { buildDecisionTickPoiGateAssertionsForTrip } from './build-decision-tick-poi-gate-assertions.util';
import { applyPoiTickFreshness } from './decision-tick-freshness.util';

@Injectable()
export class DecisionTickPoiGateProvider {
  constructor(
    @Optional() private readonly bindingStore?: DecisionTickPoiBindingStore,
  ) {}

  evaluate(input: { tripId: string }): ConstraintAssertion[] {
    if (!this.bindingStore) return [];
    const list = this.bindingStore.listForTrip(input.tripId);
    if (!list.length) return [];
    return buildDecisionTickPoiGateAssertionsForTrip(
      list.map((m) => applyPoiTickFreshness(m)),
    );
  }
}
