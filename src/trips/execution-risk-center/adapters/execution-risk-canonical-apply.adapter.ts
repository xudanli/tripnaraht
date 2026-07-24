import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  CanonicalRecommendationApplyPort,
  ConfirmRecommendationCommand,
  ConfirmedDecisionResult,
  PreviewRecommendationCommand,
  RecommendationApplyPreview,
} from '../ports/canonical-recommendation-apply.port';
import { ExecutionRiskApplyService } from '../services/execution-risk-apply.service';

/**
 * ERC → Canonical Decision runtime bridge.
 * Delegates preview/confirm to ExecutionRiskApplyService; RFC001 adapter remains底层 writer.
 */
@Injectable()
export class ExecutionRiskCanonicalApplyAdapter implements CanonicalRecommendationApplyPort {
  constructor(private readonly applyService: ExecutionRiskApplyService) {}

  async preview(command: PreviewRecommendationCommand): Promise<RecommendationApplyPreview> {
    const result = await this.applyService.applyRecommendation(
      command.tripId,
      command.riskId,
      command.recommendationId,
      command.requestedBy,
      {
        idempotencyKey: command.idempotencyKey,
        expectedPlanVersionId: command.expectedPlanVersionId,
      },
    );

    if (!result.planDiff || !result.preview) {
      throw new BadRequestException({
        code: 'PREVIEW_UNAVAILABLE',
        message: 'Recommendation apply preview could not be built',
      });
    }

    return {
      planDiff: result.planDiff,
      preview: result.preview,
      requiresConfirmation: true,
    };
  }

  async confirm(command: ConfirmRecommendationCommand): Promise<ConfirmedDecisionResult> {
    const result = await this.applyService.confirmRecommendation(
      command.tripId,
      command.riskId,
      command.recommendationId,
      command.confirmedBy,
      true,
      {
        idempotencyKey: command.idempotencyKey,
        confirmedBy: command.confirmedBy,
        expectedPlanVersionId: command.expectedPlanVersionId,
      },
    );

    if (!result.applied || !result.newPlanVersionId || !result.ledgerRef) {
      throw new BadRequestException({
        code: 'CONFIRM_WRITE_UNAVAILABLE',
        message: result.confirmHint ?? 'Confirm write path not available for this recommendation',
      });
    }

    return {
      newPlanVersionId: result.newPlanVersionId,
      ledgerRef: result.ledgerRef,
      effectivePlanVersionId: result.effectivePlanVersionId,
      planActivated: result.planActivated,
      itineraryMaterialized: result.itineraryMaterialized,
    };
  }
}
