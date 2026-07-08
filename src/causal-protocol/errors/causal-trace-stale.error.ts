import { BadRequestException } from '@nestjs/common';
import type { CausalTraceReference, CausalTraceStaleErrorBody } from '../causal-trace-reference.types';
import { CAUSAL_TRACE_STALE_ERROR_CODE } from '../causal-trace-reference.types';

export class CausalTraceStaleError extends BadRequestException {
  readonly body: CausalTraceStaleErrorBody;

  constructor(
    input: Omit<CausalTraceStaleErrorBody, 'code' | 'requiresReevaluation' | 'message'> & {
      message?: string;
    },
  ) {
    const body: CausalTraceStaleErrorBody = {
      code: CAUSAL_TRACE_STALE_ERROR_CODE,
      requiresReevaluation: true,
      message: input.message ?? '世界状态已变化，请重新预览方案后再执行',
      traceId: input.traceId,
      expectedWorldStateVersion: input.expectedWorldStateVersion,
      currentWorldStateVersion: input.currentWorldStateVersion,
    };
    super(body);
    this.body = body;
  }
}

export function isCausalTraceStaleError(e: unknown): e is CausalTraceStaleError {
  return e instanceof CausalTraceStaleError;
}

export function assertCausalTraceRefFresh(input: {
  ref: CausalTraceReference;
  currentWorldStateVersion: string;
  traceStatus?: string;
}): void {
  if (input.traceStatus === 'STALE') {
    throw new CausalTraceStaleError({
      traceId: input.ref.traceId,
      expectedWorldStateVersion: input.ref.worldStateVersion,
      currentWorldStateVersion: input.currentWorldStateVersion,
    });
  }
  if (input.ref.worldStateVersion !== input.currentWorldStateVersion) {
    throw new CausalTraceStaleError({
      traceId: input.ref.traceId,
      expectedWorldStateVersion: input.ref.worldStateVersion,
      currentWorldStateVersion: input.currentWorldStateVersion,
    });
  }
}
