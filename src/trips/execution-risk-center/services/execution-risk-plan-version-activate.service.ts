import { Injectable, Optional } from '@nestjs/common';
import type { PlanDiff } from '../../../generated/execution-risk-contracts';
import {
  Rfc001PlanVersionApplyExecutor,
  type ActivatePendingPlanVersionResult,
} from '../../guardian-decision-core/execution/plan-version-apply.executor';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import {
  isExecutionRiskApplyEffectivePlanEnabled,
  isExecutionRiskItineraryMaterializeEnabled,
} from '../config/execution-risk-feature-flags.util';

export type PlanVersionActivateResult = ActivatePendingPlanVersionResult;

@Injectable()
export class ExecutionRiskPlanVersionActivateService {
  constructor(
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    @Optional() private readonly planApplyExecutor?: Rfc001PlanVersionApplyExecutor,
  ) {}

  isActivationEnabled(): boolean {
    return isExecutionRiskApplyEffectivePlanEnabled();
  }

  async activateAfterConfirm(input: {
    tripId: string;
    planVersionId: string;
    planDiff: PlanDiff;
    decisionId: string;
    idempotencyKey: string;
    skipItineraryMaterialize?: boolean;
  }): Promise<PlanVersionActivateResult | null> {
    if (!this.isActivationEnabled() || !this.planApplyExecutor) return null;

    const version = await this.planVersionStore.get(input.tripId, input.planVersionId);
    const materializeItinerary =
      !input.skipItineraryMaterialize &&
      isExecutionRiskItineraryMaterializeEnabled() &&
      Boolean(version?.operations.length);

    return this.planApplyExecutor.activatePendingPlanVersion({
      tripId: input.tripId,
      planVersionId: input.planVersionId,
      decisionId: input.decisionId,
      idempotencyKey: input.idempotencyKey,
      planDiff: input.planDiff,
      materializeItinerary,
    });
  }
}
