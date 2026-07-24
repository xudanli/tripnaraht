/**
 * Destination pack declarative rules → canonical assertions.
 */

import { Injectable } from '@nestjs/common';
import { executePackRuleConstraint } from '../../packs/rules/pack-rule-constraint.executor';
import type { PackRuleConstraintInput } from '../../packs/rules/pack-rule-constraint.types';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { mapPackEvaluationToAssertion } from '../assertion-normalizer.service';

@Injectable()
export class DestinationPackConstraintProvider {
  evaluate(input: {
    tripId: string;
    packContext?: PackRuleConstraintInput;
  }): ConstraintAssertion[] {
    if (!input.packContext) {
      return [];
    }

    const evaluation = executePackRuleConstraint(input.packContext);
    if (!evaluation?.matched) {
      return [];
    }

    return [mapPackEvaluationToAssertion(evaluation, input.tripId)];
  }
}
