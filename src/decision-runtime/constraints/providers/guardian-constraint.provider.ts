/**
 * Guardian Rfc001ConstraintAssertion → canonical (pre-collected in workspace tick).
 */

import { Injectable } from '@nestjs/common';
import type { Rfc001ConstraintAssertion } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { mapGuardianAssertionToCanonical } from '../assertion-normalizer.service';

@Injectable()
export class GuardianConstraintProvider {
  evaluate(input: {
    tripId: string;
    guardianAssertions?: Rfc001ConstraintAssertion[];
  }): ConstraintAssertion[] {
    if (!input.guardianAssertions?.length) {
      return [];
    }
    return input.guardianAssertions.map((a) =>
      mapGuardianAssertionToCanonical(a, input.tripId),
    );
  }
}
