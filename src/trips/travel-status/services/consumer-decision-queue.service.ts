import { Injectable, Logger } from '@nestjs/common';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import {
  buildDecisionQueueHeadline,
  projectListItemToConsumerDecision,
} from '../utils/consumer-decision-item.projection.util';
import type {
  ConsumerDecisionItem,
  ConsumerDecisionQueueView,
} from '../types/travel-status.types';
import { CONSUMER_DECISION_QUEUE_SCHEMA_ID } from '../types/travel-status.types';

const MAX_OPTION_HYDRATION = 5;

@Injectable()
export class ConsumerDecisionQueueService {
  private readonly logger = new Logger(ConsumerDecisionQueueService.name);

  constructor(private readonly readModel: UnifiedDecisionProblemReadModelService) {}

  async getQueue(tripId: string, opts?: { hydrateRecommendations?: boolean }): Promise<ConsumerDecisionQueueView> {
    const generatedAt = new Date().toISOString();

    if (!isDecisionGatewayUnifiedEnabled()) {
      this.logger.warn('DECISION_GATEWAY_UNIFIED disabled; consumer decision queue returns empty');
      return emptyQueue(tripId, generatedAt);
    }

    const list = await this.readModel.listProblems(tripId, { queueOnly: true });
    const openItems = list.items.filter(
      (item) => !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus),
    );

    const blockingCount = openItems.filter((item) => item.enforcement === 'BLOCK').length;
    const hydrate = opts?.hydrateRecommendations !== false;

    const items = hydrate
      ? await this.hydrateItems(tripId, openItems)
      : openItems.map((item) => projectListItemToConsumerDecision(item));

    return {
      schemaId: CONSUMER_DECISION_QUEUE_SCHEMA_ID,
      tripId,
      generatedAt,
      headline: buildDecisionQueueHeadline(openItems.length, blockingCount),
      openCount: openItems.length,
      items,
    };
  }

  async getItem(tripId: string, problemId: string): Promise<ConsumerDecisionItem | null> {
    if (!isDecisionGatewayUnifiedEnabled()) return null;

    try {
      const detail = await this.readModel.getProblemDetail(tripId, problemId);
      return projectListItemToConsumerDecision(detail.problem, { actions: detail.actions });
    } catch {
      return null;
    }
  }

  private async hydrateItems(
    tripId: string,
    openItems: UnifiedDecisionProblemListItem[],
  ): Promise<ConsumerDecisionItem[]> {
    const toHydrate = openItems.slice(0, MAX_OPTION_HYDRATION);
    const rest = openItems.slice(MAX_OPTION_HYDRATION);

    const hydrated = await Promise.all(
      toHydrate.map(async (item) => {
        try {
          const options = await this.readModel.getProblemOptions(tripId, item.problemId);
          return projectListItemToConsumerDecision(item, { actions: options.actions });
        } catch {
          return projectListItemToConsumerDecision(item);
        }
      }),
    );

    return [...hydrated, ...rest.map((item) => projectListItemToConsumerDecision(item))];
  }
}

function emptyQueue(tripId: string, generatedAt: string): ConsumerDecisionQueueView {
  return {
    schemaId: CONSUMER_DECISION_QUEUE_SCHEMA_ID,
    tripId,
    generatedAt,
    headline: buildDecisionQueueHeadline(0, 0),
    openCount: 0,
    items: [],
  };
}
