import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CollaborativeTaskItem } from '../../domain-influence/types/trip-domain.types';
import { DecisionProblemNegotiationOrchestratorService } from './decision-problem-negotiation-orchestrator.service';

/** @deprecated Prefer DecisionProblemNegotiationOrchestratorService + POST .../negotiations */
export interface EnsureDecisionProblemPreferenceRoundResult {
  problemId: string;
  tripId: string;
  domain: import('../../wishlist/types/trip-wish.types').WishCategory;
  decisionNode: import('../types/preference-round.types').DecisionNode;
  roundId: string | null;
  created: boolean;
  boundExisting: boolean;
  memberCount: number;
  clientNavigation: {
    route: 'structured_negotiation';
    tripId: string;
    roundId: string | null;
    domain: import('../../wishlist/types/trip-wish.types').WishCategory;
    problemId: string;
  };
}

@Injectable()
export class DecisionProblemPreferenceRoundService {
  constructor(
    private readonly orchestrator: DecisionProblemNegotiationOrchestratorService,
  ) {}

  async ensurePreferenceRoundForProblem(
    tripId: string,
    userId: string,
    problemId: string,
  ): Promise<EnsureDecisionProblemPreferenceRoundResult> {
    const result = await this.orchestrator.startNegotiation(tripId, userId, problemId, {
      autoClaimDomain: true,
    });

    if (result.action === 'claim_required') {
      return {
        problemId,
        tripId,
        domain: result.roundDomain,
        decisionNode: result.decisionNode,
        roundId: null,
        created: false,
        boundExisting: false,
        memberCount: 0,
        clientNavigation: {
          route: 'structured_negotiation',
          tripId,
          roundId: null,
          domain: result.roundDomain,
          problemId,
        },
      };
    }

    return {
      problemId,
      tripId,
      domain: result.roundDomain,
      decisionNode: result.decisionNode,
      roundId: result.roundId,
      created: result.action === 'created',
      boundExisting: result.action === 'enter_existing',
      memberCount: 0,
      clientNavigation: {
        route: 'structured_negotiation',
        tripId,
        roundId: result.roundId,
        domain: result.roundDomain,
        problemId,
      },
    };
  }

  async listDecisionProblemCollaborativeTasks(
    tripId: string,
    userId: string,
    options?: {
      skipAccessCheck?: boolean;
      metadata?: Prisma.JsonValue | null;
      activeRounds?: Map<string, { id: string; closesAt: Date | null }>;
    },
  ): Promise<CollaborativeTaskItem[]> {
    return this.orchestrator.listDecisionProblemCollaborativeTasks(tripId, userId, options);
  }
}
