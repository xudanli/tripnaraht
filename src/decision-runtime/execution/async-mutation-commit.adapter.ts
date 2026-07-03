import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';
import {
  detectAsyncMutationIntent,
  isAsyncMutationWriteGuardActive,
  isAsyncMutationWriteGuardEnforce,
  resolveAsyncMutationWriteGuardMode,
  validateAsyncAuthority,
} from './async-resume-authority.util';
import type {
  AsyncMutationGuardPayloadV1,
  DurableAuthoritySnapshotV1,
} from './durable-authority-snapshot-v1.types';

export type ApplyAsyncMutationCommitGuardInput = {
  request: RouteAndRunRequestDto;
  response: RouteAndRunResponseDto;
  authoritySnapshot?: DurableAuthoritySnapshotV1 | null;
  currentTripVersion?: number;
  stage: 'resume' | 'commit';
  nowMs?: number;
};

/**
 * Async worker commit gate — blocks stale/expired results from becoming effective writes.
 */
export function applyAsyncMutationCommitGuard(
  input: ApplyAsyncMutationCommitGuardInput,
): RouteAndRunResponseDto {
  const { request, response, authoritySnapshot, currentTripVersion, stage, nowMs } = input;

  if (!isAsyncMutationWriteGuardActive()) {
    return response;
  }

  const mutationIntent = detectAsyncMutationIntent(request, response);
  if (!mutationIntent && stage === 'commit') {
    const obs = (response.observability ?? {}) as Record<string, unknown>;
    obs.authority_audit_v1 = {
      schemaId: 'tripnara.authority_audit@v1',
      routeClass: 'ASYNC_WORKER',
      orchestrationMode: 'ASYNC',
      mutationIntent: false,
      mutationAttempted: false,
      mutationCommitted: false,
      bypassDetected: false,
      reasonCodes: [],
    };
    response.observability = obs as RouteAndRunResponseDto['observability'];
    return response;
  }

  const validation = validateAsyncAuthority({
    snapshot: authoritySnapshot,
    currentTripVersion,
    nowMs,
    stage,
  });

  const obs = (response.observability ?? {}) as Record<string, unknown>;
  obs.authority_audit_v1 = {
    ...validation.auditTrace,
    reasonCodes: [
      ...validation.reasonCodes,
      `async_guard_mode=${resolveAsyncMutationWriteGuardMode()}`,
      `async_stage=${stage}`,
    ],
  };

  if (validation.allowed || !isAsyncMutationWriteGuardEnforce()) {
    if (validation.allowed && stage === 'commit') {
      obs.authority_audit_v1 = {
        ...validation.auditTrace,
        mutationCommitted: mutationIntent,
      };
    }
    response.observability = obs as RouteAndRunResponseDto['observability'];
    return response;
  }

  const guardPayload = validation.guardPayload as AsyncMutationGuardPayloadV1;
  obs.async_mutation_guard_v1 = guardPayload;

  const existingPayload = response.result?.payload;
  const payload = {
    timeline: existingPayload?.timeline ?? [],
    dropped_items: existingPayload?.dropped_items ?? [],
    candidates: existingPayload?.candidates ?? [],
    evidence: existingPayload?.evidence ?? [],
    robustness: existingPayload?.robustness ?? null,
    ...(existingPayload ?? {}),
    canonical_mutation_guard: guardPayload,
  } as RouteAndRunResponseDto['result']['payload'];

  response.result = {
    ...response.result,
    status: 'OK',
    answer_text: `${response.result.answer_text}\n\n${guardPayload.userMessage}`.trim(),
    payload,
  };
  response.observability = obs as RouteAndRunResponseDto['observability'];
  return response;
}
