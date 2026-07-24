/**
 * Legacy ConstraintChecker → Canonical ConstraintAssertion adapter.
 */

import { Injectable, Optional } from '@nestjs/common';
import { ConstraintChecker } from '../../../trips/decision/constraints/constraint-checker';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { mapLegacyViolationToAssertion } from '../assertion-normalizer.service';

@Injectable()
export class LegacyConstraintCheckerAdapter {
  constructor(@Optional() private readonly constraintChecker?: ConstraintChecker) {}

  async evaluate(input: {
    tripId: string;
    plan: TripPlan;
    worldState: TripWorldState;
    candidateId?: string;
  }): Promise<ConstraintAssertion[]> {
    if (!this.constraintChecker) {
      return [];
    }

    const result = await this.constraintChecker.checkPlan(input.worldState, input.plan);
    return result.violations.map((v) =>
      mapLegacyViolationToAssertion(v, input.tripId, input.candidateId),
    );
  }
}
