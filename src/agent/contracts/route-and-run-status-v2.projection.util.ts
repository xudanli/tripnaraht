import type {
  LegacyRouteAndRunResultStatus,
  RouteAndRunStatusProjectionInput,
  RouteAndRunStatusV2,
} from './route-and-run-status-v2.types';

/**
 * Project four-axis V2 status → legacy `result.status` for frontend compatibility.
 */
export function projectLegacyResultStatus(
  status: RouteAndRunStatusV2,
): LegacyRouteAndRunResultStatus {
  const { execution, decision, freshness, action } = status;

  if (execution.status === 'PROCESSING') return 'PROCESSING';
  if (execution.status === 'FAILED') return 'FAILED';
  if (execution.status === 'CANCELLED') return 'TIMEOUT';

  if (freshness.status === 'STALE' || freshness.status === 'EXPIRED') {
    if (decision.status === 'CONFLICTED') return 'NEED_MORE_INFO';
  }

  if (decision.status === 'NEEDS_MORE_INFO') return 'NEED_MORE_INFO';
  if (decision.status === 'NEEDS_CONFIRMATION') return 'NEED_CONFIRMATION';
  if (decision.status === 'CONFLICTED') return 'NEED_MORE_INFO';

  if (action.status === 'PREVIEW' || action.status === 'READY') {
    return 'OK';
  }

  if (decision.status === 'PARTIAL') return 'OK';
  if (decision.status === 'RESOLVED') return 'OK';

  return 'OK';
}

/**
 * Best-effort infer V2 axes from legacy status + observability hints.
 * Used during migration before assembler emits V2 natively.
 */
export function inferStatusV2FromLegacy(
  input: RouteAndRunStatusProjectionInput,
): RouteAndRunStatusV2 {
  const legacy = input.legacyStatus ?? 'OK';

  let execution: RouteAndRunStatusV2['execution'];
  if (input.asyncProcessing || legacy === 'PROCESSING') {
    execution = { status: 'PROCESSING' };
  } else if (legacy === 'FAILED' || legacy === 'TIMEOUT') {
    execution = { status: legacy === 'TIMEOUT' ? 'CANCELLED' : 'FAILED' };
  } else {
    execution = { status: 'SUCCEEDED' };
  }

  let decision: RouteAndRunStatusV2['decision'];
  if (input.tripVersionConflict) {
    decision = { status: 'CONFLICTED' };
  } else if (legacy === 'NEED_MORE_INFO' || legacy === 'REDIRECT_REQUIRED') {
    decision = { status: 'NEEDS_MORE_INFO' };
  } else if (legacy === 'NEED_CONFIRMATION' || legacy === 'NEED_CONSENT') {
    decision = { status: 'NEEDS_CONFIRMATION' };
  } else if (legacy === 'OK') {
    decision = { status: 'RESOLVED' };
  } else {
    decision = { status: 'PARTIAL' };
  }

  let freshness: RouteAndRunStatusV2['freshness'];
  if (input.evidenceStale) {
    freshness = { status: 'EXPIRED' };
  } else if (input.tripVersionConflict) {
    freshness = { status: 'STALE' };
  } else {
    freshness = { status: 'CURRENT' };
  }

  let action: RouteAndRunStatusV2['action'];
  if (input.hasActionExecution) {
    action = { status: 'EXECUTING' };
  } else if (input.hasActionPreview) {
    action = { status: 'PREVIEW' };
  } else {
    action = { status: 'NOT_REQUESTED' };
  }

  return { execution, decision, freshness, action };
}

/**
 * Round-trip check: infer V2 from legacy then project back — must not widen semantics unexpectedly.
 */
export function legacyStatusStableUnderV2Projection(
  legacy: LegacyRouteAndRunResultStatus,
): boolean {
  const v2 = inferStatusV2FromLegacy({ legacyStatus: legacy });
  const projected = projectLegacyResultStatus(v2);
  const stablePairs: Array<[LegacyRouteAndRunResultStatus, LegacyRouteAndRunResultStatus]> = [
    ['OK', 'OK'],
    ['PROCESSING', 'PROCESSING'],
    ['NEED_MORE_INFO', 'NEED_MORE_INFO'],
    ['NEED_CONFIRMATION', 'NEED_CONFIRMATION'],
    ['FAILED', 'FAILED'],
    ['TIMEOUT', 'TIMEOUT'],
    ['REDIRECT_REQUIRED', 'NEED_MORE_INFO'],
    ['NEED_CONSENT', 'NEED_CONFIRMATION'],
  ];
  const found = stablePairs.find(([from]) => from === legacy);
  return found ? found[1] === projected : projected === legacy;
}
