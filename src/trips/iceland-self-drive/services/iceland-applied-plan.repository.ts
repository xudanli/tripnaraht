/**
 * Iceland Applied PlanVersion repository — formal itinerary write surface.
 * Separate from arrange PlanProposalApply / Prisma ItineraryItem (binding later).
 */

import { Injectable } from '@nestjs/common';
import type { AppliedInitialPlanVersion } from '../types/iceland-trip-shell-preview.types';

@Injectable()
export class IcelandAppliedPlanRepository {
  private readonly byId = new Map<string, AppliedInitialPlanVersion>();
  private readonly byProposal = new Map<string, string>();
  private readonly byTrip = new Map<string, string[]>();
  /** Spy / contract counter — increments only on successful Apply */
  planVersionWriteCount = 0;

  put(row: AppliedInitialPlanVersion): void {
    const isNew = !this.byId.has(row.planVersionId);
    this.byId.set(row.planVersionId, row);
    this.byProposal.set(row.proposalId, row.planVersionId);
    const list = this.byTrip.get(row.tripId) ?? [];
    if (!list.includes(row.planVersionId)) list.push(row.planVersionId);
    this.byTrip.set(row.tripId, list);
    if (isNew) this.planVersionWriteCount += 1;
  }

  get(planVersionId: string): AppliedInitialPlanVersion | undefined {
    return this.byId.get(planVersionId);
  }

  getByProposal(proposalId: string): AppliedInitialPlanVersion | undefined {
    const id = this.byProposal.get(proposalId);
    return id ? this.byId.get(id) : undefined;
  }

  listForTrip(tripId: string): AppliedInitialPlanVersion[] {
    return (this.byTrip.get(tripId) ?? [])
      .map((id) => this.byId.get(id))
      .filter((x): x is AppliedInitialPlanVersion => Boolean(x));
  }

  count(): number {
    return this.byId.size;
  }
}
