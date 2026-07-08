import { Injectable } from '@nestjs/common';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import { ConflictSeverity } from '../../dto/trip-conflicts.dto';
import { ArrangeItineraryOverviewService } from './arrange-itinerary-overview.service';
import { ArrangeItineraryCopilotService } from './arrange-itinerary-copilot.service';
import { PlanningItemLockService } from './planning-item-lock.service';
import { PlanningModeService } from './planning-mode.service';
import { PlanningOrchestratorFacadeService } from './planning-orchestrator-facade.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import type { OrchestrationStateView } from '../types/plan-proposal.types';

export interface PlanningWorkbenchSnapshot {
  tripId: string;
  mode: Awaited<ReturnType<PlanningModeService['getMode']>>;
  orchestration: OrchestrationStateView;
  overview: Awaited<ReturnType<ArrangeItineraryOverviewService['getOverview']>>;
  itemLocks: {
    lockedCount: number;
    movableCount: number;
  };
  conflicts: {
    total: number;
    blocking: number;
  };
  copilot: {
    suggestionCount: number;
    topSuggestions: Awaited<
      ReturnType<ArrangeItineraryCopilotService['getSuggestions']>
    >['suggestions'];
    decisionClusters: Array<{
      id: string;
      title: string;
      diagnosticCount: number;
      resolvesCount: number;
      dependsOn: string[];
    }>;
  };
  activeProposals: number;
}

@Injectable()
export class PlanningWorkbenchSnapshotService {
  constructor(
    private readonly planningMode: PlanningModeService,
    private readonly orchestrator: PlanningOrchestratorFacadeService,
    private readonly overview: ArrangeItineraryOverviewService,
    private readonly itemLocks: PlanningItemLockService,
    private readonly copilot: ArrangeItineraryCopilotService,
    private readonly proposalStore: PlanProposalStoreService,
    private readonly tripConflicts: TripConflictsService,
  ) {}

  async getSnapshot(tripId: string, userId: string): Promise<PlanningWorkbenchSnapshot> {
    const [mode, overview, locks, copilotView, conflicts] = await Promise.all([
      this.planningMode.getMode(tripId),
      this.overview.getOverview(tripId, userId),
      this.itemLocks.getTripItemLocks(tripId),
      this.copilot.getSuggestions(tripId),
      this.tripConflicts.getConflicts(tripId).catch(() => null),
    ]);

    const conflictItems = conflicts?.conflicts ?? [];
    const blocking = conflictItems.filter(
      (c) => c.severity === ConflictSeverity.HIGH,
    ).length;

    const activeProposals = this.proposalStore.listByTrip(tripId, [
      'AWAITING_CONFIRMATION',
      'PREVIEW',
    ]);
    const clusterMap = new Map<
      string,
      { id: string; title: string; diagnosticCount: number; resolvesCount: number; dependsOn: string[] }
    >();
    for (const p of activeProposals) {
      for (const cluster of p.decisionPack?.decisionClusters ?? []) {
        const existing = clusterMap.get(cluster.id);
        if (!existing || cluster.diagnosticCount > existing.diagnosticCount) {
          clusterMap.set(cluster.id, {
            id: cluster.id,
            title: cluster.title,
            diagnosticCount: cluster.diagnosticCount,
            resolvesCount: cluster.resolvesCount,
            dependsOn: cluster.dependsOn,
          });
        }
      }
    }

    return {
      tripId,
      mode,
      orchestration: this.orchestrator.getOrchestrationState(tripId),
      overview,
      itemLocks: {
        lockedCount: locks.lockedItems.length + locks.semiLockedItems.length,
        movableCount: locks.movableItems.length,
      },
      conflicts: {
        total: conflictItems.length,
        blocking,
      },
      copilot: {
        suggestionCount: copilotView.suggestions.length,
        topSuggestions: copilotView.suggestions.slice(0, 5),
        decisionClusters: [...clusterMap.values()].slice(0, 5),
      },
      activeProposals: activeProposals.length,
    };
  }
}
