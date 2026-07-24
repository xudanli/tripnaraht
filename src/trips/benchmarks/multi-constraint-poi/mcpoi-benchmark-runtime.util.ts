import type { PrismaClient } from '@prisma/client';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';
import type { PlanningCausalChainNode } from '../../arrange-itinerary/types/planning-causal-chain.types';
import type { PlanningInspectorFeasibility } from '../../arrange-itinerary/types/planning-decision-inspector.types';
import {
  evaluateMcpoiPlanDay,
  type McpoiPlanEvaluation,
} from '../../arrange-itinerary/harness/mcpoi-benchmark-evaluator.util';
import { isMcpoiBenchmarkTrip } from './mcpoi-benchmark.constants';
import {
  applyProposalChangesToDayItems,
  dbDaysToMcpoiScheduledByDayIndex,
  type McpoiDbTripDay,
} from './mcpoi-itinerary.adapter.util';
import { projectMcpoiEvaluationsToFeasibilityIssues } from './mcpoi-feasibility.projection.util';
import {
  mergeMcpoiCausalChainNodes,
  projectMcpoiEvaluationToCausalNodes,
  projectMcpoiProposalDiffToCausalNodes,
} from './mcpoi-causal-chain.projection.util';
import {
  buildMcpoiInspectorFeasibility,
  overlayMcpoiInspectorFeasibility,
} from './mcpoi-inspector.projection.util';

export interface McpoiBenchmarkRuntimeSnapshot {
  tripId: string;
  evaluations: McpoiPlanEvaluation[];
  issues: FeasibilityIssueDto[];
}

export async function loadMcpoiBenchmarkSnapshot(
  prisma: PrismaClient,
  tripId: string,
): Promise<McpoiBenchmarkRuntimeSnapshot | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      metadata: true,
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              type: true,
              note: true,
              startTime: true,
              endTime: true,
              order: true,
            },
          },
        },
      },
    },
  });

  if (!trip || !isMcpoiBenchmarkTrip({ tripId: trip.id, metadata: trip.metadata })) {
    return null;
  }

  const days: McpoiDbTripDay[] = trip.TripDay.map((day, index) => ({
    id: day.id,
    date: day.date,
    dayNumber: index + 1,
    items: day.ItineraryItem,
  }));

  const evaluations = evaluateMcpoiDaysFromDb(days);
  return {
    tripId,
    evaluations,
    issues: projectMcpoiEvaluationsToFeasibilityIssues(tripId, evaluations),
  };
}

export function evaluateMcpoiDaysFromDb(days: McpoiDbTripDay[]): McpoiPlanEvaluation[] {
  const byDayIndex = dbDaysToMcpoiScheduledByDayIndex(days);
  const evaluations: McpoiPlanEvaluation[] = [];
  for (const [dayIndex, items] of byDayIndex.entries()) {
    evaluations.push(
      evaluateMcpoiPlanDay({
        items,
        dayIndex,
        variantId: undefined,
      }),
    );
  }
  return evaluations;
}

export function evaluateMcpoiProposalPreview(
  snapshot: McpoiBenchmarkRuntimeSnapshot,
  proposal: PlanProposal,
  days: McpoiDbTripDay[],
): {
  before: McpoiPlanEvaluation[];
  after: McpoiPlanEvaluation[];
  causalNodes: PlanningCausalChainNode[];
  inspectorFeasibility: PlanningInspectorFeasibility;
} {
  const byDayIndex = dbDaysToMcpoiScheduledByDayIndex(days);
  const afterEvaluations: McpoiPlanEvaluation[] = [];

  for (const beforeEval of snapshot.evaluations) {
    const baseItems = byDayIndex.get(beforeEval.dayIndex) ?? [];
    const afterItems = applyProposalChangesToDayItems(
      baseItems,
      proposal.changes,
      beforeEval.dayIndex,
    );
    afterEvaluations.push(
      evaluateMcpoiPlanDay({
        items: afterItems,
        dayIndex: beforeEval.dayIndex,
      }),
    );
  }

  const primaryBefore = snapshot.evaluations[0];
  const primaryAfter = afterEvaluations[0] ?? primaryBefore;

  const causalNodes =
    proposal.changes.length > 0
      ? projectMcpoiProposalDiffToCausalNodes({
          before: primaryBefore,
          after: primaryAfter,
          proposal,
        })
      : projectMcpoiEvaluationToCausalNodes(primaryAfter);

  return {
    before: snapshot.evaluations,
    after: afterEvaluations,
    causalNodes: mergeMcpoiCausalChainNodes([], causalNodes),
    inspectorFeasibility: buildMcpoiInspectorFeasibility(snapshot.evaluations, {
      afterProposal: primaryAfter,
    }),
  };
}

export async function buildMcpoiBenchmarkFeasibilityIssues(
  prisma: PrismaClient,
  tripId: string,
): Promise<FeasibilityIssueDto[]> {
  const snapshot = await loadMcpoiBenchmarkSnapshot(prisma, tripId);
  return snapshot?.issues ?? [];
}

export { buildMcpoiInspectorFeasibility } from './mcpoi-inspector.projection.util';

export function overlayMcpoiBenchmarkInspector(
  base: PlanningInspectorFeasibility,
  snapshot: McpoiBenchmarkRuntimeSnapshot,
  afterProposal?: McpoiPlanEvaluation,
): PlanningInspectorFeasibility {
  return overlayMcpoiInspectorFeasibility(base, snapshot.evaluations, afterProposal);
}
