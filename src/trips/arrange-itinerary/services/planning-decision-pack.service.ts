import { Injectable, Optional } from '@nestjs/common';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import type { PlanningDecisionPack } from '../types/planning-decision-pack.types';
import type { PlanProposal } from '../types/plan-proposal.types';
import { buildPlanningDecisionPack } from '../utils/plan-proposal-decision-projection.util';
import { enrichDecisionPackWithTripConflicts } from '../utils/plan-proposal-decision-enrichment.util';

@Injectable()
export class PlanningDecisionPackService {
  constructor(
    @Optional() private readonly tripConflicts?: TripConflictsService,
  ) {}

  async buildForProposal(proposal: PlanProposal): Promise<PlanningDecisionPack> {
    const base = buildPlanningDecisionPack(proposal);

    if (!this.tripConflicts) {
      return base;
    }

    try {
      const conflicts = await this.tripConflicts.getConflicts(proposal.tripId);
      return enrichDecisionPackWithTripConflicts(base, conflicts, proposal);
    } catch {
      return base;
    }
  }
}
