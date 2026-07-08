/**
 * TripIntentRouter — unified NL entry → classify → snapshot → Trigger Gateway.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionTriggerInput } from '../../contracts/decision-run-request';
import { DecisionTriggerGatewayService } from '../decision-trigger.gateway.service';
import {
  dispatchAgentRouteAndRunIfEnabled,
} from '../record-trigger-lineage.util';
import { isDecisionTriggerGatewayEnabled } from '../decision-trigger.config';
import { TripContextSnapshotAssemblerService } from '../../snapshot/trip-context-snapshot.assembler.service';
import { UnifiedDecisionProblemReadModelService } from '../../gateway/services/unified-decision-problem-read-model.service';
import {
  attachContextSnapshotToTriggerInput,
  isContextSnapshotRequired,
  readContextSnapshotFromMetadata,
} from './attach-context-snapshot.util';
import {
  classifyTripIntent,
  extractDayIndexFromMessage,
} from './classify-trip-intent.util';
import type {
  RouteTripIntentInput,
  TripIntentRouteResult,
  TripIntentSuggestedAction,
} from './trip-intent.types';
import { TRIP_INTENT_ROUTE_RESULT_SCHEMA_ID } from './trip-intent.types';

@Injectable()
export class TripIntentRouterService {
  private readonly logger = new Logger(TripIntentRouterService.name);

  constructor(
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly triggerGateway: DecisionTriggerGatewayService,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  async route(input: RouteTripIntentInput): Promise<TripIntentRouteResult> {
    const generatedAt = new Date().toISOString();
    const classification = classifyTripIntent(input.message);
    const snapshotRef = await this.snapshotAssembler.resolveSnapshotRef(input.tripId);

    const suggestedAction = resolveSuggestedAction(classification.kind);
    let decisionQueueHeadline: string | undefined;
    let openDecisionCount: number | undefined;

    if (classification.kind === 'DECISION_STATUS' && this.decisionReadModel) {
      const counts = await this.decisionReadModel.countQueueEligibleOpenProblems(input.tripId);
      openDecisionCount = counts.openCount;
      decisionQueueHeadline = buildQueueHeadline(counts.openCount, counts.blockingCount);
    }

    if (input.dryRun || classification.kind === 'DECISION_STATUS') {
      return {
        schemaId: TRIP_INTENT_ROUTE_RESULT_SCHEMA_ID,
        tripId: input.tripId,
        message: input.message,
        generatedAt,
        classification,
        contextSnapshot: snapshotRef,
        suggestedAction,
        decisionQueueHeadline,
        openDecisionCount,
      };
    }

    const triggerInput = this.buildTriggerInput(input, classification);
    const withSnapshot = attachContextSnapshotToTriggerInput(triggerInput, snapshotRef);

    if (isContextSnapshotRequired() && !readContextSnapshotFromMetadata(withSnapshot.metadata)) {
      this.logger.warn(
        `[TripIntentRouter] TRIP_CONTEXT_SNAPSHOT_REQUIRED=1 but snapshot missing trip=${input.tripId}`,
      );
    }

    const dispatch = await this.dispatchIntent(withSnapshot, classification.kind);

    return {
      schemaId: TRIP_INTENT_ROUTE_RESULT_SCHEMA_ID,
      tripId: input.tripId,
      message: input.message,
      generatedAt,
      classification,
      contextSnapshot: snapshotRef,
      suggestedAction,
      dispatch,
      decisionQueueHeadline,
      openDecisionCount,
    };
  }

  private buildTriggerInput(
    input: RouteTripIntentInput,
    classification: ReturnType<typeof classifyTripIntent>,
  ): DecisionTriggerInput {
    const baseMeta = {
      entryPointId: 'unified.trip-intent-router',
      intentKind: classification.kind,
      userMessage: input.message,
      affectsEffectivePlan: ['MODIFY_ITINERARY', 'SWAP_LODGING', 'SWAP_ACTIVITY'].includes(
        classification.kind,
      ),
    };

    switch (classification.kind) {
      case 'PLAN_TRIP':
      case 'GENERAL_QUERY':
        return {
          kind: 'LEGACY_AGENT_ROUTE',
          tripId: input.tripId,
          source: 'HTTP',
          userId: input.userId,
          metadata: baseMeta,
        };

      case 'FEASIBILITY_CHECK':
        return {
          kind: 'USER_INTENT',
          tripId: input.tripId,
          source: 'HTTP',
          userId: input.userId,
          metadata: { ...baseMeta, intent: 'feasibility_check' },
        };

      case 'WEATHER_RISK': {
        const dayIndex =
          input.dayIndex ?? extractDayIndexFromMessage(input.message) ?? 0;
        return {
          kind: 'CANONICAL_MONITORING_POLL',
          tripId: input.tripId,
          source: 'HTTP',
          userId: input.userId,
          monitoring: {
            pollKind: 'WEATHER_HAZARD',
            dayIndex,
            runFull: false,
          },
          metadata: { ...baseMeta, dayIndex },
        };
      }

      case 'SWAP_LODGING':
        return {
          kind: 'MANUAL_REPAIR_REQUEST',
          tripId: input.tripId,
          source: 'HTTP',
          userId: input.userId,
          metadata: {
            ...baseMeta,
            entryPointId: 'unified.trip-intent-router.lodging',
            repairKind: 'SWAP_LODGING',
            ...(input.problemId ? { issueId: input.problemId } : {}),
          },
        };

      case 'MODIFY_ITINERARY':
      case 'SWAP_ACTIVITY':
        return {
          kind: 'USER_INTENT',
          tripId: input.tripId,
          source: 'HTTP',
          userId: input.userId,
          problemId: input.problemId,
          metadata: {
            ...baseMeta,
            intent: classification.kind === 'SWAP_ACTIVITY' ? 'swap_activity' : 'modify_itinerary',
          },
        };

      default:
        return {
          kind: 'LEGACY_AGENT_ROUTE',
          tripId: input.tripId,
          source: 'HTTP',
          userId: input.userId,
          metadata: baseMeta,
        };
    }
  }

  private async dispatchIntent(
    input: DecisionTriggerInput,
    kind: ReturnType<typeof classifyTripIntent>['kind'],
  ) {
    if (kind === 'PLAN_TRIP' || kind === 'GENERAL_QUERY') {
      return dispatchAgentRouteAndRunIfEnabled(this.triggerGateway, input);
    }

    if (isDecisionTriggerGatewayEnabled()) {
      return this.triggerGateway.dispatch(input);
    }

    return this.triggerGateway.buildRunRequest(input);
  }
}

function buildQueueHeadline(openCount: number, blockingCount: number): string {
  if (openCount === 0) return '当前没有需要您决定的事项';
  if (blockingCount > 0) {
    return `今天需要您决定 ${openCount} 件事，其中 ${blockingCount} 项可能影响行程执行`;
  }
  return `今天需要您决定 ${openCount} 件事`;
}

function resolveSuggestedAction(kind: ReturnType<typeof classifyTripIntent>['kind']): TripIntentSuggestedAction {
  switch (kind) {
    case 'PLAN_TRIP':
    case 'GENERAL_QUERY':
    case 'MODIFY_ITINERARY':
    case 'SWAP_ACTIVITY':
    case 'FEASIBILITY_CHECK':
      return 'CALL_ROUTE_AND_RUN';
    case 'DECISION_STATUS':
      return 'OPEN_DECISION_QUEUE';
    case 'WEATHER_RISK':
    case 'SWAP_LODGING':
      return 'REVIEW_DISPATCH_RESULT';
    default:
      return 'NONE';
  }
}
