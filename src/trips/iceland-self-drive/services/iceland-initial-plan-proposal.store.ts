/**
 * In-memory proposal store — same tripId + arrangeInputHash → same proposal.
 * Not PlanVersion. Survives within process for Preview idempotency.
 */

import { Injectable } from '@nestjs/common';
import type { BuildInitialPlanProposalResult } from '../types/iceland-initial-plan-proposal.types';

@Injectable()
export class IcelandInitialPlanProposalStore {
  private readonly byKey = new Map<string, BuildInitialPlanProposalResult>();
  private readonly byProposalId = new Map<string, BuildInitialPlanProposalResult>();

  static memory(): IcelandInitialPlanProposalStore {
    return new IcelandInitialPlanProposalStore();
  }

  private key(tripId: string, hash: string): string {
    return `${tripId}::${hash}`;
  }

  getByTripAndHash(
    tripId: string,
    arrangeInputHash: string | undefined,
  ): BuildInitialPlanProposalResult | undefined {
    if (!arrangeInputHash) return undefined;
    return this.byKey.get(this.key(tripId, arrangeInputHash));
  }

  getByProposalId(proposalId: string): BuildInitialPlanProposalResult | undefined {
    return this.byProposalId.get(proposalId);
  }

  listForTrip(tripId: string): BuildInitialPlanProposalResult[] {
    return [...this.byKey.values()].filter((r) => r.tripId === tripId);
  }

  put(result: BuildInitialPlanProposalResult): void {
    this.byKey.set(this.key(result.tripId, result.arrangeInputHash), result);
    this.byProposalId.set(result.proposalId, result);
  }
}
