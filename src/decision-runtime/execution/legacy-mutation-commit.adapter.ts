import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';
import { buildAuthorityAuditTrace } from './build-authority-audit-trace.util';
import {
  isLegacyMutationWriteGuardActive,
  isLegacyMutationWriteGuardEnforce,
  resolveLegacyMutationWriteGuardMode,
} from './canonical-mutation-commit-guard.config';
import { validateMutationAuthority } from './canonical-mutation-commit-guard.util';
import type { LegacyMutationGuardPayloadV1, ProposedChangeSetV1 } from './mutation-authority-envelope-v1.types';

function hasTimelineMutation(response: RouteAndRunResponseDto): boolean {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  if (!payload) return false;
  const timeline = payload.timeline;
  return Array.isArray(timeline) && timeline.length > 0;
}

function isLegacyMutationIntent(
  request: RouteAndRunRequestDto,
  response: RouteAndRunResponseDto,
): boolean {
  const tripId = request.trip_id?.trim();
  if (!tripId) return false;
  const status = response.result?.status;
  if (status === 'FAILED' || status === 'TIMEOUT' || status === 'NEED_MORE_INFO') {
    return false;
  }
  return hasTimelineMutation(response);
}

function extractProposedChangeSet(
  request: RouteAndRunRequestDto,
  response: RouteAndRunResponseDto,
): ProposedChangeSetV1 | undefined {
  const tripId = request.trip_id?.trim();
  if (!tripId) return undefined;
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  if (!payload) return undefined;
  return {
    schemaId: 'tripnara.proposed_change_set@v1',
    tripId,
    patch: {
      timeline: payload.timeline ?? [],
      dropped_items: payload.dropped_items ?? [],
      candidates: payload.candidates ?? [],
    },
  };
}

function buildLegacyEnvelopeAttempt(
  request: RouteAndRunRequestDto,
  constraintEvaluation?: {
    evaluationId: string;
    verdict: 'PASS' | 'WARN' | 'BLOCK';
    hardConstraintViolations: string[];
  },
) {
  const clientVersion = request.options?.client_dso_version;
  return {
    tripId: request.trip_id?.trim() ?? '',
    decisionId: '',
    expectedTripVersion:
      clientVersion !== undefined && Number.isFinite(Number(clientVersion))
        ? Math.floor(Number(clientVersion))
        : undefined,
    constraintEvaluation: constraintEvaluation ?? {
      evaluationId: '',
      verdict: 'BLOCK' as const,
      hardConstraintViolations: ['CONSTRAINT_EVALUATION_MISSING'],
    },
    evidenceSnapshot: {
      snapshotId: '',
      capturedAt: new Date().toISOString(),
    },
    writeAuthority: {
      verdict: 'DENY' as const,
      reasonCodes: ['CANONICAL_AUTHORITY_UNAVAILABLE'],
    },
    executionSource: {
      routeClass: 'LEGACY_FALLBACK',
      orchestrationMode: 'LEGACY',
      durableTripRunId: request.options?.durable_trip_run_id,
    },
  };
}

export type LegacyMutationGuardOptions = {
  constraintEvaluation?: {
    evaluationId: string;
    verdict: 'PASS' | 'WARN' | 'BLOCK';
    hardConstraintViolations: string[];
  };
};

/**
 * Legacy fallback post-processor: may produce candidates, must not silent-write.
 */
export function applyLegacyMutationCommitGuard(
  request: RouteAndRunRequestDto,
  response: RouteAndRunResponseDto,
  opts?: LegacyMutationGuardOptions,
): RouteAndRunResponseDto {
  const routeClass = 'LEGACY_FALLBACK';
  const orchestrationMode = 'LEGACY';

  if (!isLegacyMutationWriteGuardActive()) {
    const obs = (response.observability ?? {}) as Record<string, unknown>;
    obs.authority_audit_v1 = buildAuthorityAuditTrace({
      routeClass,
      orchestrationMode,
      mutationIntent: false,
      reasonCodes: ['guard_off'],
    });
    response.observability = obs as RouteAndRunResponseDto['observability'];
    return response;
  }

  const mutationIntent = isLegacyMutationIntent(request, response);

  if (!mutationIntent) {
    const obs = (response.observability ?? {}) as Record<string, unknown>;
    obs.authority_audit_v1 = buildAuthorityAuditTrace({
      routeClass,
      orchestrationMode,
      mutationIntent: false,
      constraintGatewayRequired: false,
      decisionRequired: false,
      writeGuardRequired: false,
      reasonCodes: [],
    });
    response.observability = obs as RouteAndRunResponseDto['observability'];
    return response;
  }

  const proposedChangeSet = extractProposedChangeSet(request, response);
  const envelope = buildLegacyEnvelopeAttempt(request, opts?.constraintEvaluation);
  const validation = validateMutationAuthority(envelope);

  const guardPayload: LegacyMutationGuardPayloadV1 = {
    schemaId: 'tripnara.legacy_mutation_guard@v1',
    canCommit: false,
    reasonCodes: validation.reasonCodes,
    proposedChangeSet,
    userMessage:
      '已生成调整建议，但当前无法完成安全与可执行性校验，因此未修改正式行程。',
    statusV2: {
      execution: { status: 'SUCCEEDED' },
      decision: { status: 'PARTIAL' },
      freshness: { status: 'PENDING_VERIFICATION' },
      action: { status: 'BLOCKED' },
    },
  };

  const obs = (response.observability ?? {}) as Record<string, unknown>;
  obs.authority_audit_v1 = {
    ...validation.auditTrace,
    bypassDetected: isLegacyMutationWriteGuardEnforce()
      ? validation.auditTrace.bypassDetected
      : false,
    reasonCodes: [
      ...validation.reasonCodes,
      `legacy_guard_mode=${resolveLegacyMutationWriteGuardMode()}`,
    ],
  };
  obs.legacy_mutation_guard_v1 = guardPayload;

  const payload = (response.result?.payload ?? {}) as Record<string, unknown>;
  payload.canonical_mutation_guard = guardPayload;
  payload.orchestrationResult = payload.orchestrationResult ?? {
    itinerary: { mutation_blocked: true },
  };

  if (isLegacyMutationWriteGuardEnforce()) {
    const timeline =
      (proposedChangeSet?.patch.timeline as RouteAndRunResponseDto['result']['payload']['timeline'] | undefined) ??
      (Array.isArray(payload.timeline) ? payload.timeline : []);
    response.result = {
      ...response.result,
      status: 'OK',
      answer_text: `${response.result.answer_text}\n\n${guardPayload.userMessage}`.trim(),
      payload: {
        ...(response.result?.payload ?? {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
        }),
        timeline,
        canonical_mutation_guard: guardPayload,
      } as RouteAndRunResponseDto['result']['payload'],
    };
  }

  response.observability = obs as RouteAndRunResponseDto['observability'];
  return response;
}
