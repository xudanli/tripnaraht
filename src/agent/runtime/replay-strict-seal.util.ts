import { AsyncLocalStorage } from 'async_hooks';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export class ReplayStrictSealViolation extends Error {
  readonly code: 'REPLAY_STRICT_SEAL_LLM_BLOCKED' | 'REPLAY_STRICT_SEAL_INCOMPLETE';

  constructor(
    message: string,
    code: 'REPLAY_STRICT_SEAL_LLM_BLOCKED' | 'REPLAY_STRICT_SEAL_INCOMPLETE',
  ) {
    super(message);
    this.name = 'ReplayStrictSealViolation';
    this.code = code;
  }
}

export type ReplayStrictSealContext = {
  active: boolean;
  requestId?: string;
  anchorSnapshotId?: string;
};

const replayStrictSealStorage = new AsyncLocalStorage<ReplayStrictSealContext>();

export function isReplayStrictSealActive(
  request?: Pick<RouteAndRunRequestDto, 'options'>,
): boolean {
  return request?.options?.orchestration_replay_strict_seal === true;
}

/** Strict seal requires anchor snapshot + upgrade disabled (product replay contract). */
export function isReplayStrictSealComplete(
  request?: Pick<RouteAndRunRequestDto, 'options'>,
): boolean {
  if (!isReplayStrictSealActive(request)) return false;
  const anchor = request?.options?.orchestration_replay_anchor_snapshot_id?.trim();
  return Boolean(anchor) && request?.options?.execution_model_allow_upgrade === false;
}

export function runWithReplayStrictSealContext<T>(
  ctx: ReplayStrictSealContext,
  fn: () => T,
): T {
  return replayStrictSealStorage.run(ctx, fn);
}

export function getReplayStrictSealContext(): ReplayStrictSealContext | undefined {
  return replayStrictSealStorage.getStore();
}

/** Throws when replay strict seal is active — blocks fresh provider/model calls. */
export function assertFreshLlmCallAllowedUnderReplayStrictSeal(): void {
  const ctx = getReplayStrictSealContext();
  if (ctx?.active) {
    throw new ReplayStrictSealViolation(
      'orchestration_replay_strict_seal forbids fresh LLM calls during deterministic replay',
      'REPLAY_STRICT_SEAL_LLM_BLOCKED',
    );
  }
}

export function evaluateReplayStrictSealPolicy(
  request: Pick<RouteAndRunRequestDto, 'options'>,
): {
  sealed: boolean;
  suppressesFreshLlmCalls: boolean;
  disablesRouteContextEnricher: boolean;
  disablesDosIntentCompile: boolean;
  forbidsModeFallback: boolean;
} {
  const active = isReplayStrictSealActive(request);
  const sealed = isReplayStrictSealComplete(request);
  return {
    sealed,
    suppressesFreshLlmCalls: sealed,
    disablesRouteContextEnricher: active,
    disablesDosIntentCompile: active,
    forbidsModeFallback: active,
  };
}

export function sealReplayRouteAndRunRequest(
  request: RouteAndRunRequestDto,
  anchorSnapshotId: string,
): RouteAndRunRequestDto {
  return {
    ...request,
    options: {
      ...request.options,
      orchestration_replay_anchor_snapshot_id: anchorSnapshotId.trim(),
      orchestration_replay_strict_seal: true,
      execution_model_allow_upgrade: false,
    },
  };
}

export function buildReplayStrictSealObservability(input: {
  request: Pick<RouteAndRunRequestDto, 'options'>;
  freshLlmCallCount: number;
}): Record<string, unknown> {
  const active = isReplayStrictSealActive(input.request);
  const sealed = isReplayStrictSealComplete(input.request);
  return {
    schemaId: 'tripnara.replay_strict_seal@v1',
    active,
    sealed,
    fresh_llm_calls: input.freshLlmCallCount,
    suppresses_fresh_llm: sealed && input.freshLlmCallCount === 0,
  };
}

export function resolveReplayStrictSealContextFromRequest(
  request: RouteAndRunRequestDto,
): ReplayStrictSealContext {
  return {
    active: isReplayStrictSealActive(request),
    requestId: request.request_id,
    anchorSnapshotId: request.options?.orchestration_replay_anchor_snapshot_id?.trim(),
  };
}
