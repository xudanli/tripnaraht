/**
 * PlanObject 日内评估 → Gateway ConstraintAssertion（Phase 4）。
 */

import { Injectable } from '@nestjs/common';
import { PlanObjectProjectionService } from '../../plan-objects/services/plan-object-projection.service';
import { isPlanObjectGatewayEvaluationEnabled } from '../../plan-objects/plan-object.config';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { planObjectProjectionToAssertions } from '../adapters/plan-object-assessment-to-assertion.adapter';

@Injectable()
export class PlanObjectConstraintProvider {
  constructor(private readonly projection: PlanObjectProjectionService) {}

  isEnabled(): boolean {
    return isPlanObjectGatewayEvaluationEnabled();
  }

  async evaluateForTrip(tripId: string): Promise<ConstraintAssertion[]> {
    if (!this.isEnabled()) return [];
    const view = await this.projection.buildProjection(tripId);
    return planObjectProjectionToAssertions(tripId, view);
  }
}
