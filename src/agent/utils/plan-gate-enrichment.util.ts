import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { PlanningDaySplitDto } from '../../trips/trip-constraint-solver/types/planning-conflicts.types';
import type { TripFeasibilityReportDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { FeasibilityReportService } from '../../trips/trip-constraint-solver/services/feasibility-report.service';
import type { SplitPlanService } from '../../trips/trip-constraint-solver/services/split-plan.service';
import {
  estimateDraftExecutability,
  extractFeasibilitySnapshot,
} from './plan-gate-feasibility.projection.util';
import {
  memberSplitBlockers,
  projectMemberSplitDiff,
  type PlanGateMemberSplitChange,
} from './plan-gate-member-diff.projection.util';
import type { PlanGateDiffProjectionOptions } from './plan-gate-diff.projection.util';

export interface PlanGateEnrichmentContext {
  baselineExecutability?: number;
  draftExecutability?: number;
  feasibilityVerifiedAt?: string;
  feasibilityReport?: TripFeasibilityReportDto;
  daySplits?: PlanningDaySplitDto[];
  baselineDaySplits?: PlanningDaySplitDto[];
  memberChanges?: PlanGateMemberSplitChange[];
  memberSplitBlockers?: string[];
  diffOptions?: PlanGateDiffProjectionOptions;
}

export async function resolvePlanGateEnrichmentContext(input: {
  tripId?: string;
  planState: PlanState;
  baselinePlanState?: PlanState;
  feasibilityReport?: FeasibilityReportService;
  splitPlanService?: SplitPlanService;
}): Promise<{ context: PlanGateEnrichmentContext; planState: PlanState }> {
  const context: PlanGateEnrichmentContext = {};
  let planState = input.planState;

  if (!input.tripId) {
    return { context, planState };
  }

  let report = context.feasibilityReport;
  if (input.feasibilityReport) {
    try {
      report = await input.feasibilityReport.getReportFast(input.tripId);
      context.feasibilityReport = report;
      context.baselineExecutability = Math.round(report.overallScore);
      context.feasibilityVerifiedAt = report.verifiedAt;
    } catch {
      // 快速 feasibility 不可用时降级为 planState 估算
    }
  }

  const draftExec = estimateDraftExecutability(planState, report);
  context.draftExecutability = draftExec;
  planState = {
    ...planState,
    metadata: {
      ...planState.metadata,
      executabilityScore: draftExec,
      feasibilityVerifiedAt: context.feasibilityVerifiedAt,
    },
  };

  if (
    context.baselineExecutability == null &&
    input.baselinePlanState?.metadata?.executabilityScore != null
  ) {
    context.baselineExecutability = input.baselinePlanState.metadata
      .executabilityScore as number;
  }

  if (input.splitPlanService) {
    try {
      const daySplits = await input.splitPlanService.projectDaySplits(input.tripId, {
        lightweight: true,
        report,
      });
      if (daySplits?.length) {
        context.daySplits = daySplits;
        const memberCounts = daySplits.flatMap((d) =>
          d.branches.map((b) => b.memberCount ?? b.members?.length ?? 0),
        );
        const maxMembers = memberCounts.length ? Math.max(...memberCounts) : undefined;
        planState = {
          ...planState,
          metadata: {
            ...planState.metadata,
            planGateDaySplits: daySplits,
            affectedMembers: maxMembers,
          },
        };
      }

      const baselineDaySplits =
        (input.baselinePlanState?.metadata?.planGateDaySplits as
          | PlanningDaySplitDto[]
          | undefined) ?? undefined;
      context.baselineDaySplits = baselineDaySplits;
      context.memberChanges = projectMemberSplitDiff(baselineDaySplits, daySplits);
      context.memberSplitBlockers = memberSplitBlockers(context.memberChanges);
    } catch {
      // 分流投影失败时不阻塞主流程
    }
  }

  context.diffOptions = {
    baselineExecutability: context.baselineExecutability,
    draftExecutability: context.draftExecutability,
    memberChanges: context.memberChanges,
  };

  return { context, planState };
}

export function buildFeasibilityEndpointSnapshot(input: {
  tripId: string;
  planState: PlanState;
  baselinePlanState?: PlanState;
  report?: TripFeasibilityReportDto;
  enrichment?: PlanGateEnrichmentContext;
}) {
  const enrichment = input.enrichment;
  const draftExec =
    enrichment?.draftExecutability ??
    estimateDraftExecutability(input.planState, input.report);
  const baselineExec =
    enrichment?.baselineExecutability ??
    (input.report ? Math.round(input.report.overallScore) : undefined) ??
    (input.baselinePlanState?.metadata?.executabilityScore as number | undefined);

  const fromReport = input.report ? extractFeasibilitySnapshot(input.report) : undefined;
  const draftSource = fromReport ? ('feasibility_report' as const) : ('plan_state_estimate' as const);

  return {
    tripId: input.tripId,
    planId: input.planState.plan_id,
    baselinePlanId: input.baselinePlanState?.plan_id,
    draft: {
      executability: draftExec,
      source: draftSource,
      verifiedAt: enrichment?.feasibilityVerifiedAt ?? fromReport?.verifiedAt,
      verdictStatus: fromReport?.verdictStatus,
      canStartExecute: fromReport?.canStartExecute,
      memberCount: fromReport?.memberCount,
      completenessScore: fromReport?.completenessScore,
    },
    baseline: fromReport
      ? {
          ...fromReport,
          executability: baselineExec ?? fromReport.executability,
        }
      : baselineExec != null
        ? {
            executability: baselineExec,
            source: 'plan_state_estimate' as const,
          }
        : undefined,
    delta: {
      executability:
        baselineExec != null || draftExec != null
          ? { from: baselineExec, to: draftExec }
          : undefined,
    },
  };
}
