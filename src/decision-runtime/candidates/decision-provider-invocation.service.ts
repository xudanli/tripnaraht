/**
 * HTTP-facing dispatch for structured Agentic providers (advisory only).
 */

import { Injectable, Optional } from '@nestjs/common';
import type { TripWorldState } from '../../trips/decision/world-model';
import type { TripPlan } from '../../trips/decision/plan-model';
import { AgenticResearchProvider } from './providers/agentic-research.provider';
import { AgenticNarrationProvider } from './providers/agentic-narration.provider';
import { ConstraintCriticProvider } from './providers/constraint-critic.provider';
import type {
  CriticProviderResult,
  NarrationProviderResult,
  ResearchProviderResult,
} from './contracts/decision-providers';

@Injectable()
export class DecisionProviderInvocationService {
  constructor(
    @Optional() private readonly research?: AgenticResearchProvider,
    @Optional() private readonly narration?: AgenticNarrationProvider,
    @Optional() private readonly critic?: ConstraintCriticProvider,
  ) {}

  async invokeResearch(input: {
    tripId: string;
    query?: string;
    state?: TripWorldState;
  }): Promise<ResearchProviderResult> {
    if (!this.research) {
      throw new Error('AgenticResearchProvider unavailable');
    }
    return this.research.gatherResearch(input);
  }

  async invokeNarration(input: {
    tripId: string;
    plan?: TripPlan;
    decisionRecordId?: string;
  }): Promise<NarrationProviderResult> {
    if (!this.narration) {
      throw new Error('AgenticNarrationProvider unavailable');
    }
    return this.narration.explain(input);
  }

  async invokeCritic(input: {
    tripId: string;
    plan?: TripPlan;
    state?: TripWorldState;
  }): Promise<CriticProviderResult> {
    if (!this.critic) {
      throw new Error('ConstraintCriticProvider unavailable');
    }
    return this.critic.critique(input);
  }
}
