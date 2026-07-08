/**
 * Legacy MultiPlanGenerator → CandidateGenerationProvider.
 */

import { Injectable } from '@nestjs/common';
import type {
  CandidateGenerationProvider,
  CandidateGenerationResult,
} from '../contracts/decision-providers';
import { LegacyTripPlanningAdapter } from '../legacy-planning.adapter';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { PlanningContext } from '../contracts/decision-candidate';

@Injectable()
export class LegacyCandidateGenerationProvider implements CandidateGenerationProvider {
  readonly providerId = 'legacy-trip-planning' as const;

  constructor(private readonly legacyAdapter: LegacyTripPlanningAdapter) {}

  async generateCandidates(
    worldState: TripWorldState,
    context: PlanningContext,
  ): Promise<CandidateGenerationResult> {
    const candidates = await this.legacyAdapter.generateCandidates(worldState, context);
    return {
      schemaId: 'tripnara.candidate_generation_result@v1',
      providerId: this.providerId,
      tripId: context.tripId,
      candidates,
      generatedAt: new Date().toISOString(),
    };
  }
}
