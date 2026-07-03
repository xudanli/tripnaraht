/**
 * Four-axis route_and_run status (V2).
 * Legacy `result.status` remains a compatibility projection — do not add enums there.
 */

export type RouteAndRunExecutionStatus =
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export type RouteAndRunDecisionStatus =
  | 'RESOLVED'
  | 'NEEDS_MORE_INFO'
  | 'NEEDS_CONFIRMATION'
  | 'PARTIAL'
  | 'CONFLICTED';

export type RouteAndRunFreshnessStatus =
  | 'CURRENT'
  | 'STALE'
  | 'EXPIRED'
  | 'PENDING_VERIFICATION';

export type RouteAndRunActionStatus =
  | 'NOT_REQUESTED'
  | 'PREVIEW'
  | 'READY'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'ROLLED_BACK'
  | 'BLOCKED';

export interface RouteAndRunStatusV2 {
  execution: { status: RouteAndRunExecutionStatus };
  decision: { status: RouteAndRunDecisionStatus };
  freshness: { status: RouteAndRunFreshnessStatus };
  action: { status: RouteAndRunActionStatus };
}

/** Legacy result.status union (RouteAndRunResponseDto.result.status) */
export type LegacyRouteAndRunResultStatus =
  | 'OK'
  | 'PROCESSING'
  | 'NEED_MORE_INFO'
  | 'NEED_CONSENT'
  | 'NEED_CONFIRMATION'
  | 'FAILED'
  | 'TIMEOUT'
  | 'REDIRECT_REQUIRED';

export interface RouteAndRunStatusProjectionInput {
  /** Existing legacy status when V2 not yet populated */
  legacyStatus?: LegacyRouteAndRunResultStatus;
  hasActionPreview?: boolean;
  hasActionExecution?: boolean;
  tripVersionConflict?: boolean;
  evidenceStale?: boolean;
  asyncProcessing?: boolean;
}
