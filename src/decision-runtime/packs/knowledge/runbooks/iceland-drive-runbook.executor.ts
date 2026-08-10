/**
 * Fixed Iceland drive runbook executor.
 * Common safety → context → impact → candidates → verify → confirm → plan version.
 */

import {
  loadIcelandDriveRunbook,
  resolveRunbookIdForEventType,
} from './iceland-drive-runbook.loader';
import type {
  IcelandDriveRunbook,
  IcelandDriveRunbookCandidateOp,
  IcelandDriveRunbookContext,
  IcelandDriveRunbookExecutionResult,
  IcelandDriveRunbookId,
} from './iceland-drive-runbook.types';
import {
  resolveIcelandSafeStop,
  resolveIcelandSafeStopById,
} from '../road/resolve-iceland-safe-stop';

function defaultOperations(
  runbook: IcelandDriveRunbook,
  ctx: IcelandDriveRunbookContext,
): IcelandDriveRunbookCandidateOp[] {
  if (ctx.proposedOperations?.length) {
    return ctx.proposedOperations.filter((op) =>
      runbook.candidateOperations.includes(op),
    );
  }
  return [...runbook.candidateOperations];
}

function verifyProposal(
  runbook: IcelandDriveRunbook,
  ctx: IcelandDriveRunbookContext,
  ops: IcelandDriveRunbookCandidateOp[],
): { verified: boolean; fallbackApplied?: { when: string; action: string } } {
  switch (runbook.runbookId) {
    case 'IS_RB_ROAD_CLOSURE': {
      if (ctx.roadStatus === 'CLOSED' && !ctx.roadSegmentId) {
        return { verified: false };
      }
      if (ops.includes('REROUTE') || ops.includes('END_DAY_EARLY') || ops.includes('SWAP')) {
        return { verified: true };
      }
      const fb = runbook.fallback.find((f) => f.when === 'no_bypass_available');
      return {
        verified: !!fb,
        fallbackApplied: fb,
      };
    }
    case 'IS_RB_STRONG_WIND': {
      const hasDelayRange =
        Array.isArray(ctx.estimatedDelayMinRange) &&
        ctx.estimatedDelayMinRange.length === 2 &&
        ctx.estimatedDelayMinRange[0]! <= ctx.estimatedDelayMinRange[1]!;
      const reducesExposure =
        ops.includes('SHORTEN') ||
        ops.includes('REROUTE') ||
        ops.includes('END_DAY_EARLY') ||
        ops.includes('SHIFT');
      if (hasDelayRange && reducesExposure) {
        return { verified: true };
      }
      if (
        ctx.roadExposure === 'HIGH' &&
        (ctx.vehicleClass === 'campervan' || ctx.vehicleClass === 'high_profile')
      ) {
        const fb = runbook.fallback.find(
          (f) => f.when === 'exposure_critical_high_profile',
        );
        return { verified: !!fb, fallbackApplied: fb };
      }
      return { verified: false };
    }
    case 'IS_RB_FUEL_INSUFFICIENT': {
      const ok =
        ctx.fuelAssessmentStatus === 'WARN' ||
        (ctx.fuelAssessmentStatus === 'BLOCK' &&
          !!ctx.fuelRecommendedAction &&
          (ctx.fuelPrimaryStation != null ||
            ctx.fuelRecommendedAction === 'REPLAN_ROUTE'));
      return { verified: ok };
    }
    case 'IS_RB_BOOKING_ETA_MISS': {
      const late = (ctx.etaMinutesLate ?? 0) > 0;
      if (!late) return { verified: false };
      const canRecover =
        (ctx.shortenableSlotIds?.length ?? 0) > 0 &&
        (ops.includes('SHORTEN') || ops.includes('REMOVE') || ops.includes('SHIFT'));
      if (canRecover) return { verified: true };
      const fb = runbook.fallback.find((f) => f.when === 'no_shortenable_slots');
      return { verified: !!fb, fallbackApplied: fb };
    }
    default:
      return { verified: ops.length > 0 };
  }
}

function buildProposalSummary(
  runbook: IcelandDriveRunbook,
  ctx: IcelandDriveRunbookContext,
  ops: IcelandDriveRunbookCandidateOp[],
  verified: boolean,
): string {
  const parts = [
    `runbook=${runbook.runbookId}`,
    `event=${ctx.eventType}`,
    `ops=${ops.join('|') || 'none'}`,
    `verified=${verified}`,
  ];
  if (ctx.roadSegmentId) parts.push(`road=${ctx.roadSegmentId}:${ctx.roadStatus ?? '?'}`);
  if (ctx.safeStopPoiId) parts.push(`safeStop=${ctx.safeStopPoiId}`);
  if (ctx.windGustMs != null) parts.push(`gustMs=${ctx.windGustMs}`);
  if (ctx.estimatedDelayMinRange) {
    parts.push(
      `delayMin=${ctx.estimatedDelayMinRange[0]}-${ctx.estimatedDelayMinRange[1]}`,
    );
  }
  if (ctx.bookingId) parts.push(`booking=${ctx.bookingId}`);
  if (ctx.etaMinutesLate != null) parts.push(`lateMin=${ctx.etaMinutesLate}`);
  if (ctx.fuelRecommendedAction) parts.push(`fuelAction=${ctx.fuelRecommendedAction}`);
  if (ctx.notes?.length) parts.push(`notes=${ctx.notes.join(',')}`);
  return parts.join('; ');
}

function needsSafeStopResolve(runbook: IcelandDriveRunbook): boolean {
  return (
    runbook.contextRequired.includes('safeStopPoiId') ||
    runbook.tools.some((t) => t.toolId === 'iceland.road.safeStop') ||
    runbook.confirmationPolicy === 'SAFE_STOP_REQUIRED'
  );
}

/**
 * Fill safeStopPoiId from curated catalog when missing.
 * Does not invent ids — unresolved leaves field empty.
 */
function attachSafeStopFromCatalog(
  runbook: IcelandDriveRunbook,
  ctx: IcelandDriveRunbookContext,
  stepsCompleted: string[],
  cwd: string,
): IcelandDriveRunbookContext {
  if (!needsSafeStopResolve(runbook)) {
    return ctx;
  }

  if (ctx.safeStopPoiId) {
    const known = resolveIcelandSafeStopById(ctx.safeStopPoiId, cwd);
    if (known) {
      stepsCompleted.push('SAFE_STOP_CATALOG_HIT');
      return ctx;
    }
    stepsCompleted.push('SAFE_STOP_ID_UNVERIFIED');
    return ctx;
  }

  const hit = resolveIcelandSafeStop(
    {
      lat: ctx.lat,
      lng: ctx.lng,
      roadId: ctx.roadSegmentId,
    },
    cwd,
  );
  if (hit) {
    stepsCompleted.push('RESOLVE_SAFE_STOP');
    return { ...ctx, safeStopPoiId: hit.stop.poiId };
  }
  stepsCompleted.push('SAFE_STOP_UNRESOLVED');
  return ctx;
}

/**
 * Execute a registered runbook from trigger context to verified proposal.
 * Does not write plan versions — prepares command metadata for Decision/Repair Runtime.
 */
export function executeIcelandDriveRunbook(
  runbookId: IcelandDriveRunbookId,
  ctx: IcelandDriveRunbookContext,
  cwd: string = process.cwd(),
): IcelandDriveRunbookExecutionResult {
  const runbook = loadIcelandDriveRunbook(runbookId, cwd);
  const stepsCompleted: string[] = [];

  stepsCompleted.push(`DETECT_${runbook.scenarioType}`);

  const immediateSafetyActions = runbook.immediateSafetyActions.map((a) => a.code);
  const prohibitedActions = runbook.prohibitedActions.map((a) => a.code);
  stepsCompleted.push('APPLY_IMMEDIATE_SAFETY');

  if (
    runbook.confirmationPolicy === 'SAFE_STOP_REQUIRED' ||
    immediateSafetyActions.includes('CONFIRM_SAFE_STOP')
  ) {
    if (ctx.userSafeStopped) {
      stepsCompleted.push('SAFE_STOP_CONFIRMED');
    } else {
      stepsCompleted.push('REQUIRE_SAFE_STOP_CONFIRMATION');
    }
  }

  stepsCompleted.push('COLLECT_CONTEXT');
  const ctxWithStop = attachSafeStopFromCatalog(runbook, ctx, stepsCompleted, cwd);
  stepsCompleted.push('INVOKE_DECLARED_TOOLS');
  stepsCompleted.push('ANALYZE_ITINERARY_IMPACT');

  const candidateOperations = defaultOperations(runbook, ctxWithStop);
  stepsCompleted.push('GENERATE_CANDIDATE_OPERATIONS');

  const { verified, fallbackApplied } = verifyProposal(
    runbook,
    ctxWithStop,
    candidateOperations,
  );
  stepsCompleted.push('VERIFY_PROPOSAL');

  if (
    runbook.confirmationPolicy === 'USER_CONFIRM' ||
    runbook.confirmationPolicy === 'SAFE_STOP_REQUIRED'
  ) {
    stepsCompleted.push('AWAIT_USER_CONFIRM');
  } else if (runbook.confirmationPolicy === 'ACKNOWLEDGE') {
    stepsCompleted.push('ACKNOWLEDGE_ONLY');
  }

  if (runbook.apply.createPlanVersion) {
    stepsCompleted.push('PREPARE_PLAN_VERSION_COMMAND');
  }

  return {
    runbookId: runbook.runbookId,
    scenarioType: runbook.scenarioType,
    stepsCompleted,
    immediateSafetyActions,
    prohibitedActions,
    candidateOperations,
    confirmationPolicy: runbook.confirmationPolicy,
    createPlanVersion: runbook.apply.createPlanVersion,
    ledgerRequired: runbook.apply.ledgerRequired,
    commandType: runbook.apply.commandType,
    verifiedProposal: verified,
    proposalSummary: buildProposalSummary(
      runbook,
      ctxWithStop,
      candidateOperations,
      verified,
    ),
    fallbackApplied,
    contextEcho: {
      eventType: ctxWithStop.eventType,
      roadSegmentId: ctxWithStop.roadSegmentId,
      roadStatus: ctxWithStop.roadStatus,
      safeStopPoiId: ctxWithStop.safeStopPoiId,
      windGustMs: ctxWithStop.windGustMs,
      bookingId: ctxWithStop.bookingId,
      etaMinutesLate: ctxWithStop.etaMinutesLate,
      fuelAssessmentStatus: ctxWithStop.fuelAssessmentStatus,
      fuelRecommendedAction: ctxWithStop.fuelRecommendedAction,
    },
    evidence: runbook.evidence,
  };
}

/** Resolve runbook by event type then execute. */
export function executeIcelandDriveRunbookForEvent(
  ctx: IcelandDriveRunbookContext,
  cwd: string = process.cwd(),
): IcelandDriveRunbookExecutionResult | undefined {
  const id = resolveRunbookIdForEventType(ctx.eventType, cwd);
  if (!id) return undefined;
  return executeIcelandDriveRunbook(id, ctx, cwd);
}
