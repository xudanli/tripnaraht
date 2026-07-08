/**
 * Guide plan variants → DecisionCore.finalize (no Effective Plan execute).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { GuidePlanVariant } from '../constants/guide-to-plan-status.constants';
import type { GuideItineraryDraft } from './guide-plan-builder.service';
import type { GuideTravelContext } from '../types/guide-to-plan.types';
import { FullPlanSelectionService } from '../../decision-runtime/core/full-plan-selection.service';
import type { FullPlanSelectionResult } from '../../decision-runtime/core/full-plan-selection.service';
import { isGuideCanonicalPlanSelectionEnabled } from '../../decision-runtime/constraints/constraint-evaluation.config';
import {
  type GuideBuiltVariantInput,
} from '../adapters/guide-draft-candidate.adapter';
import { buildGuideTripWorldState } from '../utils/guide-world-state.util';
import { constraintReportToWarnings } from '../utils/guide-constraint-warnings.util';
import { GuideCandidateGenerationProvider } from '../providers/guide-candidate-generation.provider';
import { DecisionTriggerGatewayService } from '../../decision-runtime/trigger/decision-trigger.gateway.service';
import { isDecisionTriggerGatewayEnabled } from '../../decision-runtime/trigger/decision-trigger.config';

export interface GuideVariantBuiltInput {
  variant: GuidePlanVariant;
  itineraryDraft: GuideItineraryDraft;
  utilityHint?: number;
}

export interface GuideCanonicalFinalizeResult {
  selection: FullPlanSelectionResult;
  warningsByVariant: Record<string, string[]>;
  recommendedVariant: GuidePlanVariant;
}

@Injectable()
export class GuideCanonicalSelectionService {
  private readonly logger = new Logger(GuideCanonicalSelectionService.name);

  constructor(
    private readonly fullPlanSelection: FullPlanSelectionService,
    private readonly guideCandidateProvider: GuideCandidateGenerationProvider,
    @Optional() private readonly triggerGateway?: DecisionTriggerGatewayService,
  ) {}

  isEnabled(): boolean {
    return isGuideCanonicalPlanSelectionEnabled();
  }

  async finalizeGuideVariants(input: {
    sessionId: string;
    countryCode: string;
    travelContext?: GuideTravelContext | null;
    variants: GuideVariantBuiltInput[];
  }): Promise<GuideCanonicalFinalizeResult | null> {
    if (!this.isEnabled() || input.variants.length === 0) {
      return null;
    }

    const travelModeDefault =
      input.travelContext?.transportMode === 'self_drive' ? 'drive' : 'walk';

    const generated = this.guideCandidateProvider.generateFromVariants({
      sessionId: input.sessionId,
      variants: input.variants as GuideBuiltVariantInput[],
      travelModeDefault,
    });
    const candidates = generated.candidates;

    const referenceDraft = input.variants.find((v) => v.variant === 'balanced')?.itineraryDraft
      ?? input.variants[0].itineraryDraft;

    const worldState = buildGuideTripWorldState({
      countryCode: input.countryCode,
      travelContext: input.travelContext,
      draft: referenceDraft,
      sessionId: input.sessionId,
    });

    const problemId = `guide_plan_${input.sessionId}_${Date.now()}`;
    const planningContext = {
      tripId: input.sessionId,
      basePlanVersionId: `guide_session_${input.sessionId}`,
      worldStateSnapshotId: `guide_ws_${input.sessionId}`,
      preferenceSnapshotId: `guide_pref_${input.sessionId}`,
    };

    let selection: FullPlanSelectionResult;
    if (isDecisionTriggerGatewayEnabled() && this.triggerGateway) {
      const dispatch = await this.triggerGateway.dispatch({
        kind: 'GUIDE_IMPORT_REQUEST',
        tripId: input.sessionId,
        source: 'GUIDE_TO_PLAN',
        requestId: problemId,
        fullPlanSelection: {
          worldState,
          context: planningContext,
          prebuiltCandidates: candidates,
          problemId,
        },
        metadata: { phase: 'selection', sessionId: input.sessionId },
      });
      if (dispatch.status !== 'COMPLETED' || !dispatch.result) {
        throw new Error(
          dispatch.error?.message ?? 'Guide selection trigger dispatch failed',
        );
      }
      selection = dispatch.result as FullPlanSelectionResult;
    } else {
      selection = await this.fullPlanSelection.selectFromPrebuiltCandidates({
        worldState,
        context: planningContext,
        candidates,
        problemId,
      });
    }

    const warningsByVariant: Record<string, string[]> = {};
    for (const [variantId, report] of Object.entries(selection.constraintReports)) {
      warningsByVariant[variantId] = constraintReportToWarnings(report);
    }

    const recommendedVariant = (selection.record.selectedCandidateId ??
      'balanced') as GuidePlanVariant;

    this.logger.log(
      `[GuideCanonical] session=${input.sessionId} variants=${input.variants.length} recommended=${recommendedVariant} decision=${selection.record.decisionId}`,
    );

    return {
      selection,
      warningsByVariant,
      recommendedVariant,
    };
  }
}
