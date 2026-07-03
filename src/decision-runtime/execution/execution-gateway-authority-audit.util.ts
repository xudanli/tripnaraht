import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';
import { attachRouteAndRunStatusV2ForRequest } from '../../agent/contracts/route-and-run-status-v2.attach.util';
import {
  buildConstraintGatewayIngressSnapshot,
  resolvePrimaryConstraintGatewayIngress,
} from '../../decision-runtime/constraints/constraint-gateway-ingress-audit.util';
import { readRouteClassForkFromRequest } from '../../agent/routing/route-and-run-route-class-fork.util';
import { signalsFromRequest } from '../../agent/utils/orchestration-signals.util';
import { shouldAcquireTripOrchestrationLock } from '../../agent/utils/trip-orchestration-lock.util';
import { resolveDecisionRuntimeCapabilities } from './decision-runtime-capabilities.util';
import { buildAuthorityAuditTrace } from './build-authority-audit-trace.util';
import type { AuthorityAuditTraceV1 } from './authority-audit-trace-v1.types';

export type GatewayAuthorityConclusion =
  | 'CANONICAL'
  | 'PARTIAL'
  | 'BYPASS'
  | 'READ_ONLY';

export type GatewayAuthorityEntryContext = {
  routeClass: string;
  mutationIntent: boolean;
  readOnlyPath: boolean;
  tripId?: string;
  expectedTripVersion?: number;
  constraintGatewayEnabled: boolean;
  effectivePlanWriteGuardEnabled: boolean;
  entryAudit: AuthorityAuditTraceV1;
};

function resolveExpectedTripVersion(request: RouteAndRunRequestDto): number | undefined {
  const raw = request.options?.client_dso_version;
  if (raw === undefined || !Number.isFinite(Number(raw))) return undefined;
  return Math.floor(Number(raw));
}

function resolveRouteClass(request: RouteAndRunRequestDto): string {
  const fork = readRouteClassForkFromRequest(request);
  if (fork?.routeClass) return fork.routeClass;
  const signals = signalsFromRequest(request);
  return signals.capability === 'PLANNING_AND_REVISION' ? 'PARTIAL_REPLAN' : 'QUICK_ANSWER';
}

function isReadOnlyTripPath(request: RouteAndRunRequestDto): boolean {
  const tripId = request.trip_id?.trim();
  if (!tripId) return false;
  const signals = signalsFromRequest(request);
  return !shouldAcquireTripOrchestrationLock(request, signals);
}

function hasTimelineMutation(response: RouteAndRunResponseDto): boolean {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  const timeline = payload?.timeline;
  return Array.isArray(timeline) && timeline.length > 0;
}

function resolveOrchestrationMode(response: RouteAndRunResponseDto): string {
  const obs = response.observability as Record<string, unknown> | undefined;
  const mode =
    obs?.orchestration_mode_final ??
    obs?.mode_final ??
    (response.result?.payload as Record<string, unknown> | undefined)?.orchestration_mode;
  return typeof mode === 'string' && mode.trim() ? mode.trim() : 'UNKNOWN';
}

function extractExistingAuthorityAudit(
  response: RouteAndRunResponseDto,
): AuthorityAuditTraceV1 | undefined {
  const audit = (response.observability as Record<string, unknown> | undefined)?.authority_audit_v1;
  if (!audit || typeof audit !== 'object') return undefined;
  if ((audit as AuthorityAuditTraceV1).schemaId !== 'tripnara.authority_audit@v1') return undefined;
  return audit as AuthorityAuditTraceV1;
}

function extractGuardPayload(response: RouteAndRunResponseDto): {
  canCommit?: boolean;
  reasonCodes?: string[];
} | undefined {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  const guard = payload?.canonical_mutation_guard;
  if (!guard || typeof guard !== 'object') return undefined;
  return guard as { canCommit?: boolean; reasonCodes?: string[] };
}

export function resolveGatewayAuthorityConclusion(input: {
  mutationIntent: boolean;
  readOnlyPath: boolean;
  bypassDetected: boolean;
  mutationCommitted: boolean;
  constraintInvoked: boolean;
  writeGuardVerdict?: 'ALLOW' | 'DENY';
}): GatewayAuthorityConclusion {
  if (input.readOnlyPath || !input.mutationIntent) return 'READ_ONLY';
  if (input.mutationCommitted && input.constraintInvoked && input.writeGuardVerdict === 'ALLOW') {
    return 'CANONICAL';
  }
  if (input.bypassDetected) return 'BYPASS';
  return 'PARTIAL';
}

/** Build gateway entry context + initial authority audit (pre-orchestration). */
export function buildGatewayAuthorityEntryContext(
  request: RouteAndRunRequestDto,
): GatewayAuthorityEntryContext {
  const signals = signalsFromRequest(request);
  const tripId = request.trip_id?.trim();
  const mutationIntent = Boolean(tripId) && shouldAcquireTripOrchestrationLock(request, signals);
  const readOnlyPath = isReadOnlyTripPath(request);
  const caps = resolveDecisionRuntimeCapabilities();
  const routeClass = resolveRouteClass(request);

  const entryAudit = buildAuthorityAuditTrace({
    routeClass,
    orchestrationMode: 'UNKNOWN',
    mutationIntent,
    mutationAttempted: false,
    mutationCommitted: false,
    constraintGatewayRequired: mutationIntent,
    constraintGatewayInvoked: false,
    decisionRequired: mutationIntent,
    decisionRecorded: false,
    expectedTripVersion: resolveExpectedTripVersion(request),
    writeGuardRequired: mutationIntent,
    writeGuardInvoked: false,
    reasonCodes: [
      ...(readOnlyPath ? (['READ_ONLY_PATH'] as const) : []),
      ...(mutationIntent && !caps.constraintGateway ? (['CONSTRAINT_GATEWAY_OFF'] as const) : []),
      ...(mutationIntent && !caps.effectivePlanWriteGuard
        ? (['EFFECTIVE_PLAN_WRITE_GUARD_OFF'] as const)
        : []),
    ],
  });

  return {
    routeClass,
    mutationIntent,
    readOnlyPath,
    tripId,
    expectedTripVersion: resolveExpectedTripVersion(request),
    constraintGatewayEnabled: caps.constraintGateway,
    effectivePlanWriteGuardEnabled: caps.effectivePlanWriteGuard,
    entryAudit,
  };
}

function mergeAuthorityAuditTraces(
  entry: AuthorityAuditTraceV1,
  finalize: Partial<AuthorityAuditTraceV1>,
): AuthorityAuditTraceV1 {
  return {
    ...entry,
    ...finalize,
    orchestrationMode: finalize.orchestrationMode ?? entry.orchestrationMode,
    constraintGateway: {
      ...entry.constraintGateway,
      ...finalize.constraintGateway,
    },
    decisionLedger: {
      ...entry.decisionLedger,
      ...finalize.decisionLedger,
    },
    tripVersion: {
      ...entry.tripVersion,
      ...finalize.tripVersion,
    },
    writeGuard: {
      ...entry.writeGuard,
      ...finalize.writeGuard,
    },
    evidence: {
      ...entry.evidence,
      ...finalize.evidence,
    },
    reasonCodes: [...new Set([...entry.reasonCodes, ...(finalize.reasonCodes ?? [])])],
    bypassDetected: finalize.bypassDetected ?? entry.bypassDetected,
  };
}

/** Finalize authority audit after orchestration; merges adapter-level traces when present. */
export function finalizeGatewayAuthorityAudit(input: {
  request: RouteAndRunRequestDto;
  response: RouteAndRunResponseDto;
  entryContext: GatewayAuthorityEntryContext;
}): AuthorityAuditTraceV1 {
  const { request, response, entryContext } = input;
  const orchestrationMode = resolveOrchestrationMode(response);
  const existing = extractExistingAuthorityAudit(response);
  const guardPayload = extractGuardPayload(response);
  const ingressPrimary = resolvePrimaryConstraintGatewayIngress();
  const mutationAttempted =
    entryContext.mutationIntent &&
    (hasTimelineMutation(response) ||
      Boolean(guardPayload) ||
      Boolean(existing?.mutationAttempted));
  const mutationCommitted =
    existing?.mutationCommitted ??
    (guardPayload?.canCommit === true && mutationAttempted);
  const constraintInvoked = Boolean(
    existing?.constraintGateway.invoked ||
      existing?.constraintGateway.evaluationId ||
      ingressPrimary?.evaluationId,
  );
  const constraintEvaluationId =
    existing?.constraintGateway.evaluationId ?? ingressPrimary?.evaluationId;
  const constraintVerdict =
    existing?.constraintGateway.verdict ??
    ingressPrimary?.verdict ??
    (guardPayload?.canCommit === false ? 'DENY' : guardPayload?.canCommit === true ? 'ALLOW' : undefined);
  const writeGuardVerdict =
    existing?.writeGuard.verdict ??
    (guardPayload?.canCommit === false ? 'DENY' : guardPayload?.canCommit === true ? 'ALLOW' : undefined);

  const finalizePartial = buildAuthorityAuditTrace({
    routeClass: entryContext.routeClass,
    orchestrationMode,
    mutationIntent: entryContext.mutationIntent,
    mutationAttempted,
    mutationCommitted,
    constraintGatewayRequired: entryContext.mutationIntent,
    constraintGatewayInvoked: constraintInvoked,
    constraintEvaluationId,
    constraintVerdict,
    decisionRequired: entryContext.mutationIntent,
    decisionId: existing?.decisionLedger.decisionId,
    decisionRecorded: existing?.decisionLedger.recorded,
    expectedTripVersion: entryContext.expectedTripVersion,
    actualTripVersion: existing?.tripVersion.actual,
    writeGuardRequired: entryContext.mutationIntent,
    writeGuardInvoked: existing?.writeGuard.invoked ?? Boolean(guardPayload),
    writeGuardVerdict,
    evidenceSnapshotId: existing?.evidence.snapshotId,
    evidenceFreshness: existing?.evidence.freshness,
    reasonCodes: [
      ...entryContext.entryAudit.reasonCodes,
      ...(guardPayload?.reasonCodes ?? []),
      ...((response.observability as { fallback_used?: boolean } | undefined)?.fallback_used
        ? (['FALLBACK_USED'] as const)
        : []),
    ],
  });

  const merged = existing
    ? mergeAuthorityAuditTraces(entryContext.entryAudit, {
        ...existing,
        orchestrationMode,
        mutationAttempted,
        mutationCommitted,
        bypassDetected: existing.bypassDetected || finalizePartial.bypassDetected,
        reasonCodes: finalizePartial.reasonCodes,
      })
    : mergeAuthorityAuditTraces(entryContext.entryAudit, finalizePartial);

  const conclusion = resolveGatewayAuthorityConclusion({
    mutationIntent: entryContext.mutationIntent,
    readOnlyPath: entryContext.readOnlyPath,
    bypassDetected: merged.bypassDetected,
    mutationCommitted,
    constraintInvoked,
    writeGuardVerdict,
  });

  return {
    ...merged,
    reasonCodes: [...new Set([...merged.reasonCodes, `gateway_conclusion=${conclusion}`])],
  };
}

export function applyGatewayAuthorityAuditToResponse(input: {
  request: RouteAndRunRequestDto;
  response: RouteAndRunResponseDto;
  entryContext: GatewayAuthorityEntryContext;
}): RouteAndRunResponseDto {
  const audit = finalizeGatewayAuthorityAudit(input);
  const obs = (input.response.observability ?? {}) as Record<string, unknown>;
  obs.authority_audit_v1 = audit;
  obs.authority_gateway_v1 = {
    schemaId: 'tripnara.authority_gateway@v1',
    stage: 'finalize',
    routeClass: input.entryContext.routeClass,
    mutationIntent: input.entryContext.mutationIntent,
    readOnlyPath: input.entryContext.readOnlyPath,
    constraintGatewayEnabled: input.entryContext.constraintGatewayEnabled,
    effectivePlanWriteGuardEnabled: input.entryContext.effectivePlanWriteGuardEnabled,
    conclusion: audit.reasonCodes
      .find((c) => c.startsWith('gateway_conclusion='))
      ?.slice('gateway_conclusion='.length),
  };
  const ingressSnapshot = buildConstraintGatewayIngressSnapshot();
  if (ingressSnapshot.records.length > 0) {
    obs.constraint_gateway_ingress_v1 = ingressSnapshot;
  }
  input.response.observability = obs as RouteAndRunResponseDto['observability'];
  return attachRouteAndRunStatusV2ForRequest({
    request: input.request,
    response: input.response,
  });
}
