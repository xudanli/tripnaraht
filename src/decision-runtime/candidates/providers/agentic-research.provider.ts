/**
 * Structured research artifacts — advisory only, no formal decision authority.
 */

import { Injectable } from '@nestjs/common';
import type {
  ResearchProvider,
  ResearchProviderResult,
} from '../contracts/decision-providers';

@Injectable()
export class AgenticResearchProvider implements ResearchProvider {
  readonly providerId = 'agentic-research' as const;

  async gatherResearch(input: {
    tripId: string;
    query?: string;
    worldState?: import('../../../trips/decision/world-model').TripWorldState;
  }): Promise<ResearchProviderResult> {
    const dateKeys = Object.keys(input.worldState?.candidatesByDate ?? {});
    return {
      schemaId: 'tripnara.research_provider_result@v1',
      providerId: this.providerId,
      tripId: input.tripId,
      artifacts: [
        {
          evidenceId: `research_${input.tripId}_${Date.now()}`,
          kind: 'trip_context_summary',
          summary: input.query?.trim() || 'Structured research placeholder',
          payload: {
            candidateDateCount: dateKeys.length,
            hasTravelMatrix: Boolean(input.worldState?.travelMatrix),
          },
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }
}
