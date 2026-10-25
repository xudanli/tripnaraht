/**
 * Policy Lab CONFLICT_MATRIX → Constraint Gateway assertions.
 */

import { Injectable, Optional } from '@nestjs/common';
import { PolicyLabConflictMatrixService } from '../../../domain/policy-lab/policy-lab-conflict-matrix.service';
import { policyLabHitToAssertion } from '../../../domain/policy-lab/policy-lab-effect-to-registry.util';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';

@Injectable()
export class PolicyLabConstraintProvider {
  constructor(
    @Optional() private readonly conflictMatrix?: PolicyLabConflictMatrixService,
  ) {}

  async evaluate(input: {
    tripId: string;
    plan?: TripPlan;
    worldState?: TripWorldState;
    candidateId?: string;
    vehicleType?: string;
  }): Promise<ConstraintAssertion[]> {
    if (!this.conflictMatrix) return [];

    const physical = (input.worldState as any)?.physical;
    const hasRoad = Array.isArray(physical?.roadStates);
    const hasPrefetched =
      Array.isArray(physical?.prefetched_evidence) || Array.isArray(physical?.prefetchedEvidence);
    // Skip when no physical facts were supplied — avoid fallback HARD_BLOCK on empty plans.
    if (!hasRoad && !hasPrefetched && input.vehicleType == null) {
      return [];
    }

    try {
      const hits = await this.conflictMatrix.evaluateFromWorldState({
        worldState: input.worldState,
        plan: input.plan,
        vehicleType: input.vehicleType,
      });
      return hits.map((hit) =>
        policyLabHitToAssertion(hit, input.tripId, { candidateId: input.candidateId }),
      );
    } catch {
      return [];
    }
  }
}
