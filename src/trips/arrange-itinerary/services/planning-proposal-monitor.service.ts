import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanProposalContextService } from './plan-proposal-context.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import type { PlanningProposalValidityView } from '../types/planning-decision-pack.types';

@Injectable()
export class PlanningProposalMonitorService {
  constructor(
    private readonly store: PlanProposalStoreService,
    private readonly context: PlanProposalContextService,
  ) {}

  async getValidity(proposalId: string): Promise<PlanningProposalValidityView> {
    const proposal = this.store.get(proposalId);
    if (!proposal) {
      throw new NotFoundException(`规划草案 ${proposalId} 不存在或已过期`);
    }

    const snapshot = await this.context.snapshot(proposal.tripId);
    const expired = new Date(proposal.expiresAt).getTime() <= Date.now();
    const contextStale = this.context.isStale(proposal.contextVersion, snapshot);

    let staleReason: string | undefined;
    if (expired) staleReason = '草案已超过 validUntil';
    else if (contextStale) staleReason = '行程上下文已变化（contextVersion 不匹配）';
    else if (proposal.status === 'STALE') staleReason = '草案已标记为 STALE';
    else if (proposal.status === 'DISCARDED') staleReason = '草案已丢弃';
    else if (proposal.status === 'APPLIED') staleReason = '草案已应用';

    const monitorWebhookUrl = `/api/trips/${proposal.tripId}/arrange-itinerary/proposals/${proposal.proposalId}/monitor`;

    return {
      proposalId: proposal.proposalId,
      tripId: proposal.tripId,
      validUntil: proposal.expiresAt,
      contextVersion: proposal.contextVersion,
      isStale: Boolean(staleReason) || expired || contextStale,
      staleReason,
      monitorWebhookUrl,
      orchestrationPhase:
        proposal.status === 'AWAITING_CONFIRMATION' ? 'AWAITING_CONFIRMATION' : proposal.status,
    };
  }
}
