import type { VerificationIssue } from '../../../decision/kernel/decision-state.types';
import type {
  GateResultLike,
  PhaseExecutorContext,
} from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { Itinerary } from '../../interfaces/trip-plan.interface';
import type { PlanContext, PlanState, GateStatus } from '../../../skills/plan/shared/plan-state.types';
import type { CanonicalTravelGraph } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import type { PlanningWorkbenchRequest } from '../../services/planning-workbench-agent.service';

export const WORKBENCH_VERIFY_REASON_PREFIX = '[VERIFY]';

export type PlanningWorkbenchKernelVerifyMetadata = {
  applied: boolean;
  skipped?: boolean;
  reason?: string;
  issueCount: number;
  fatalCount: number;
  conflictCount: number;
  advisoryCount: number;
  verifyItinerarySource?: string;
  graphProjectedItemCount?: number;
  confidenceDelta?: number;
  issues?: Array<{ code: string; class: string; message: string }>;
  appliedAt: string;
  decisionOsAudit?: Record<string, unknown>;
};

export type PlanningWorkbenchKernelVerifyOutcome = {
  skipped: boolean;
  reason?: string;
  gateStatus: GateStatus;
  metadata: PlanningWorkbenchKernelVerifyMetadata;
};

export type PlanningWorkbenchKernelRepairMetadata = {
  applied: boolean;
  skipped?: boolean;
  reason?: string;
  segmentsUpdated?: number;
  itemsApplied?: number;
  appliedAt: string;
};

export type PlanningWorkbenchKernelVerifyRepairOutcome = PlanningWorkbenchKernelVerifyOutcome & {
  repair?: PlanningWorkbenchKernelRepairMetadata;
  reVerify?: PlanningWorkbenchKernelVerifyMetadata;
};

function formatDestination(ctx: PlanContext): string {
  const parts = [ctx.destination.city, ctx.destination.region, ctx.destination.country].filter(
    Boolean,
  );
  return parts.join(', ') || 'unknown';
}

export function buildWorkbenchVerifyPhaseContext(params: {
  request: PlanningWorkbenchRequest;
  planState: PlanState;
  requestId: string;
  tripRunId?: string | null;
}): PhaseExecutorContext | undefined {
  const meta = (params.planState.metadata ?? {}) as Record<string, unknown>;
  const projected = meta.graph_projected_itinerary as Itinerary | undefined;
  const graph = meta.canonical_travel_graph as CanonicalTravelGraph | undefined;
  const verifyItinerarySource = meta.verify_itinerary_source as
    | 'planner_draft'
    | 'canonical_travel_graph@v0'
    | undefined;

  if (!projected?.days?.length) {
    return undefined;
  }

  const requestMetadata = params.request.metadata as Record<string, unknown> | undefined;

  return {
    requestId: params.requestId,
    userId: typeof requestMetadata?.userId === 'string' ? requestMetadata.userId : undefined,
    tripId: params.request.tripId,
    itinerary: projected,
    canonicalTravelGraph: graph,
    verifyItinerarySource: verifyItinerarySource ?? 'canonical_travel_graph@v0',
    tripPlanRequest: {
      destination: formatDestination(params.request.context),
      days: params.request.context.days ?? params.planState.constraints.time.days,
      trip_id: params.request.tripId,
      total_budget: params.planState.constraints.budget?.total,
      budget: params.planState.constraints.budget,
      party: params.planState.constraints.companions?.count
        ? { count: params.planState.constraints.companions.count }
        : undefined,
      message: `规划工作台 VERIFY: ${formatDestination(params.request.context)}`,
    },
    researchData: params.planState.world ? { worldModel: params.planState.world } : undefined,
  };
}

/** CONFLICT 且非 FATAL 时可进入 Kernel REPAIR */
export function workbenchVerifyNeedsRepair(issues: VerificationIssue[]): boolean {
  if (issues.some((issue) => issue.class === 'FATAL')) return false;
  return issues.some((issue) => issue.class === 'CONFLICT');
}

export function buildWorkbenchRepairGateResult(
  gate: GateStatus,
  issues: VerificationIssue[],
): GateResultLike {
  const actionable = issues.filter((issue) => issue.class === 'CONFLICT' || issue.class === 'FATAL');
  const adjustments = actionable.flatMap((issue) =>
    (issue.suggestedActions ?? []).map((action) => ({
      action: action.action,
      why: action.detail ?? issue.message,
    })),
  );

  return {
    gate_result: gate.status === 'REJECT' ? 'BLOCK' : 'ADJUST_REQUIRED',
    violations: actionable.map((issue) => ({
      type: String(issue.code),
      severity: issue.class === 'FATAL' ? ('HARD' as const) : ('SOFT' as const),
      detail: issue.message,
    })),
    required_adjustments:
      adjustments.length > 0
        ? adjustments
        : [{ action: 'REPLACE', why: 'Kernel VERIFY detected repairable conflicts' }],
    confidence: 0.6,
  };
}

export function summarizeKernelRepairMetadata(params: {
  applied: boolean;
  skipped?: boolean;
  reason?: string;
  segmentsUpdated?: number;
  itemsApplied?: number;
}): PlanningWorkbenchKernelRepairMetadata {
  return {
    applied: params.applied,
    skipped: params.skipped,
    reason: params.reason,
    segmentsUpdated: params.segmentsUpdated,
    itemsApplied: params.itemsApplied,
    appliedAt: new Date().toISOString(),
  };
}

export function verificationIssuesFromSummary(
  issues: Array<{ code: string; class: string; message: string }> | undefined,
): VerificationIssue[] {
  return (issues ?? []).map((issue) => ({
    code: issue.code as VerificationIssue['code'],
    class: issue.class as VerificationIssue['class'],
    message: issue.message,
  }));
}

export function workbenchVerifyNeedsRepairFromSummary(
  issues: Array<{ class: string }> | undefined,
): boolean {
  if (!issues?.length) return false;
  if (issues.some((issue) => issue.class === 'FATAL')) return false;
  return issues.some((issue) => issue.class === 'CONFLICT');
}

export function applyKernelVerifyIssuesToGateStatus(
  gate: GateStatus,
  issues: VerificationIssue[],
): GateStatus {
  const baseReasons = (gate.reasons ?? []).filter(
    (reason) => !String(reason).trimStart().startsWith(WORKBENCH_VERIFY_REASON_PREFIX),
  );
  const reasons = [...baseReasons];
  let status = gate.status;

  for (const issue of issues) {
    reasons.push(`${WORKBENCH_VERIFY_REASON_PREFIX} ${issue.code}: ${issue.message}`);
    if (issue.class === 'FATAL') {
      status = 'REJECT';
    } else if (issue.class === 'CONFLICT' && status !== 'REJECT') {
      status = 'NEED_CONFIRM';
    } else if (issue.class === 'ADVISORY' && status === 'ALLOW') {
      status = 'NEED_CONFIRM';
    }
  }

  return {
    ...gate,
    status,
    reasons: [...new Set(reasons)],
    consolidatedVerdict:
      status === 'ALLOW' ? 'ALLOW' : status === 'REJECT' ? 'REJECT' : 'NEED_CONFIRM',
    requiredUserConfirmations:
      status === 'NEED_CONFIRM'
        ? [...new Set([...(gate.requiredUserConfirmations ?? []), ...reasons.slice(0, 5)])]
        : gate.requiredUserConfirmations,
  };
}

export function projectKernelVerifyConflicts(issues: VerificationIssue[]): Record<string, unknown> {
  const conflicts = issues.map((issue) => ({
    type: 'feasibility' as const,
    severity:
      issue.class === 'FATAL'
        ? ('critical' as const)
        : issue.class === 'CONFLICT'
          ? ('high' as const)
          : ('medium' as const),
    description: `${WORKBENCH_VERIFY_REASON_PREFIX} ${issue.code}: ${issue.message}`,
    affectedDays: issue.entityRef?.type === 'DAY' && issue.entityRef.id
      ? [Number.parseInt(issue.entityRef.id, 10) + 1].filter((n) => !Number.isNaN(n))
      : undefined,
  }));

  return {
    conflictArbitration: {
      conflicts,
      verifiedAt: new Date().toISOString(),
      source: 'decision_kernel_verify@v0',
    },
  };
}

export function summarizeKernelVerifyMetadata(params: {
  issues: VerificationIssue[];
  confidenceDelta: number;
  verifyItinerarySource?: string;
  graphProjectedItemCount?: number;
  applied: boolean;
  skipped?: boolean;
  reason?: string;
}): PlanningWorkbenchKernelVerifyMetadata {
  const fatalCount = params.issues.filter((i) => i.class === 'FATAL').length;
  const conflictCount = params.issues.filter((i) => i.class === 'CONFLICT').length;
  const advisoryCount = params.issues.filter((i) => i.class === 'ADVISORY').length;

  return {
    applied: params.applied,
    skipped: params.skipped,
    reason: params.reason,
    issueCount: params.issues.length,
    fatalCount,
    conflictCount,
    advisoryCount,
    verifyItinerarySource: params.verifyItinerarySource,
    graphProjectedItemCount: params.graphProjectedItemCount,
    confidenceDelta: params.confidenceDelta,
    issues: params.issues.slice(0, 20).map((issue) => ({
      code: String(issue.code),
      class: issue.class,
      message: issue.message,
    })),
    appliedAt: new Date().toISOString(),
  };
}
