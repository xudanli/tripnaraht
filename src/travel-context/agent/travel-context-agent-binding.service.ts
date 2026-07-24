import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ContextBlock } from '../../agent/context-engine/types/context-package.types';
import { TravelContextResolverService } from '../snapshot/travel-context-resolver.service';
import { TravelContextSnapshotBuilderService } from '../snapshot/travel-context-snapshot-builder.service';
import type {
  TravelContextAgentBindingInput,
  TravelContextAgentGrounding,
} from './travel-context-agent-binding.types';
import {
  buildTravelContextContextBlock,
  buildTravelContextGrounding,
  resolveAgentIncludeDomains,
} from './travel-context-agent-binding.util';

export interface TravelContextAgentBindingResult {
  grounding: TravelContextAgentGrounding;
  block: ContextBlock;
}

@Injectable()
export class TravelContextAgentBindingService {
  private readonly logger = new Logger(TravelContextAgentBindingService.name);

  constructor(
    private readonly resolver: TravelContextResolverService,
    private readonly builder: TravelContextSnapshotBuilderService,
  ) {}

  async bind(input: TravelContextAgentBindingInput): Promise<TravelContextAgentBindingResult | null> {
    const contextId = await this.resolveContextId(input);
    if (!contextId) return null;

    const snapshot = await this.builder.build(contextId);

    if (input.userId) {
      const ref = await this.resolver.resolve(contextId);
      if (ref.ownerUserId !== input.userId) {
        throw new BadRequestException({
          code: 'FORBIDDEN',
          message: 'User cannot bind agent context for this travel context',
        });
      }
    }

    if (input.revision != null && input.revision !== snapshot.meta.revision) {
      throw new BadRequestException({
        code: 'STALE_TRAVEL_CONTEXT_REVISION',
        message: `Context has moved to revision ${snapshot.meta.revision}`,
        details: {
          expectedRevision: input.revision,
          currentRevision: snapshot.meta.revision,
          contextId,
        },
      });
    }

    const { taskType, includeDomains } = resolveAgentIncludeDomains(
      input.agent,
      input.task,
      input.includeDomains,
    );

    const grounding = buildTravelContextGrounding({
      snapshot,
      agentId: input.agent,
      taskType,
      includeDomains,
      includePrivate: input.includePrivate,
    });

    this.logger.debug(
      `Agent grounding agent=${input.agent} contextId=${grounding.contextId} revision=${grounding.revision}`,
    );

    return {
      grounding,
      block: buildTravelContextContextBlock(grounding),
    };
  }

  private async resolveContextId(input: TravelContextAgentBindingInput): Promise<string | undefined> {
    if (input.contextId?.trim()) return input.contextId.trim();
    if (!input.tripId?.trim()) return undefined;

    const ref = await this.resolver.resolveByTripId(input.tripId.trim());
    return ref.contextId;
  }
}
