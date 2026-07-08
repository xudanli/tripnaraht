/**
 * Structured decision narration — advisory explanation artifact.
 */

import { Injectable } from '@nestjs/common';
import type {
  NarrationProvider,
  NarrationProviderResult,
} from '../contracts/decision-providers';

@Injectable()
export class AgenticNarrationProvider implements NarrationProvider {
  readonly providerId = 'agentic-narration' as const;

  async explain(input: {
    tripId: string;
    plan?: import('../../../trips/decision/plan-model').TripPlan;
    decisionRecordId?: string;
  }): Promise<NarrationProviderResult> {
    const dayCount = input.plan?.days?.length ?? 0;
    const summary =
      dayCount > 0
        ? `Trip ${input.tripId}: ${dayCount} day(s) in current plan.`
        : `Trip ${input.tripId}: no plan days available for narration.`;

    return {
      schemaId: 'tripnara.narration_provider_result@v1',
      providerId: this.providerId,
      tripId: input.tripId,
      explanation: {
        summary,
        sections: input.decisionRecordId
          ? [{ title: 'Decision', body: `Linked record ${input.decisionRecordId}` }]
          : undefined,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
