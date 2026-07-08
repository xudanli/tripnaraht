/**
 * Guide plan variants → CandidateGenerationProvider (lives in guide-to-plan to avoid circular imports).
 */

import { Injectable } from '@nestjs/common';
import type {
  CandidateGenerationProvider,
  CandidateGenerationResult,
} from '../../decision-runtime/candidates/contracts/decision-providers';
import type { TripWorldState } from '../../trips/decision/world-model';
import type { PlanningContext } from '../../decision-runtime/candidates/contracts/decision-candidate';
import {
  mapGuideVariantsToDecisionCandidates,
  type GuideBuiltVariantInput,
} from '../adapters/guide-draft-candidate.adapter';

export interface GuideCandidateGenerationInput {
  sessionId: string;
  variants: GuideBuiltVariantInput[];
  travelModeDefault?: 'drive' | 'walk';
}

@Injectable()
export class GuideCandidateGenerationProvider implements CandidateGenerationProvider {
  readonly providerId = 'guide-plan-variants' as const;

  generateFromVariants(input: GuideCandidateGenerationInput): CandidateGenerationResult {
    const candidates = mapGuideVariantsToDecisionCandidates({
      variants: input.variants,
      sessionId: input.sessionId,
      travelModeDefault: input.travelModeDefault ?? 'walk',
    });
    return {
      schemaId: 'tripnara.candidate_generation_result@v1',
      providerId: this.providerId,
      tripId: input.sessionId,
      candidates,
      generatedAt: new Date().toISOString(),
    };
  }

  async generateCandidates(
    worldState: TripWorldState,
    context: PlanningContext,
  ): Promise<CandidateGenerationResult> {
    const meta = context as PlanningContext & {
      guideVariants?: GuideBuiltVariantInput[];
      guideSessionId?: string;
    };
    const sessionId = meta.guideSessionId ?? context.tripId;
    const variants = meta.guideVariants;
    if (!variants?.length) {
      throw new Error(
        'GuideCandidateGenerationProvider requires context.guideVariants + guideSessionId',
      );
    }
    const travelModeDefault =
      worldState.context.travelModeDefault === 'drive' ? 'drive' : 'walk';
    return this.generateFromVariants({ sessionId, variants, travelModeDefault });
  }
}
