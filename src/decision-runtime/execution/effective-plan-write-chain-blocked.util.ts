import { BadRequestException } from '@nestjs/common';
import { errorResponse } from '../../common/dto/standard-response.dto';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';
import {
  EffectivePlanWriteBypassError,
  EffectivePlanWriteGuardService,
} from './effective-plan-write-guard.service';

export const EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE = 'EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED';

export const EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS = [
  'POST /trips/:tripId/decision-problems/:problemId/resolutions',
  'POST /trips/:tripId/decision-problems/:problemId/apply',
  'POST /api/uwc/v1/write/apply',
  'POST /api/rfc001/decisions/:id/execute',
  'POST /api/internal/rfc001/iceland/trips/:tripId/decisions/:id/execute',
] as const;

export interface EffectivePlanWriteChainBlockedPayload {
  success: false;
  error: typeof EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE;
  code: typeof EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE;
  message: string;
  caller: string;
  authorizedPaths: readonly string[];
}

export interface EffectivePlanWriteChainBadRequestBody {
  code: typeof EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE;
  message: string;
  caller: string;
  authorizedPaths: readonly string[];
}

export function buildEffectivePlanWriteChainBadRequestBody(
  caller: string,
  message?: string,
): EffectivePlanWriteChainBadRequestBody {
  return {
    code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    message:
      message ??
      `Plan mutation blocked (${caller}): use DecisionCore → decision-problems apply`,
    caller,
    authorizedPaths: EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  };
}

export function buildEffectivePlanWriteChainBlockedPayload(
  caller: string,
): EffectivePlanWriteChainBlockedPayload {
  const body = buildEffectivePlanWriteChainBadRequestBody(caller);
  return {
    success: false,
    error: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    message: body.message,
    caller: body.caller,
    authorizedPaths: body.authorizedPaths,
  };
}

export function isDirectPlanMutationBlocked(): boolean {
  return isEffectivePlanWriteChainEnabled();
}

/** Legacy ERC bridge — block direct plan mutations when write chain is enforced. */
export function assertDirectEffectivePlanWriteBlocked(caller: string): void {
  if (!isDirectPlanMutationBlocked()) return;
  throw new BadRequestException(buildEffectivePlanWriteChainBadRequestBody(caller));
}

/** Service-layer: assert write authority or throw structured BadRequestException */
export function assertPlanMutationAllowedOrThrow(
  guard: EffectivePlanWriteGuardService | undefined,
  caller: string,
): void {
  try {
    guard?.assertAuthorizedPlanMutation(caller);
  } catch (e) {
    if (e instanceof EffectivePlanWriteBypassError) {
      throw new BadRequestException(buildEffectivePlanWriteChainBadRequestBody(caller, e.message));
    }
    throw e;
  }
}

export function isEffectivePlanWriteChainBadRequest(
  error: unknown,
): error is BadRequestException {
  if (!(error instanceof BadRequestException)) return false;
  const resp = error.getResponse();
  if (typeof resp === 'string') return false;
  return (resp as { code?: string }).code === EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE;
}

export function extractEffectivePlanWriteChainError(
  error: BadRequestException,
): { code: string; message: string; details: Record<string, unknown> } {
  const resp = error.getResponse();
  const body =
    typeof resp === 'string'
      ? null
      : (resp as Partial<EffectivePlanWriteChainBadRequestBody> & { code?: string; message?: string });
  return {
    code: body?.code ?? EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    message: String(body?.message ?? error.message),
    details: {
      caller: body?.caller,
      authorizedPaths: body?.authorizedPaths ?? EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
      writeChain: true,
    },
  };
}

/** Controller-layer: map write-chain BadRequest → StandardResponse */
export function mapWriteChainBlockedToErrorResponse(error: unknown) {
  if (!isEffectivePlanWriteChainBadRequest(error)) return null;
  const extracted = extractEffectivePlanWriteChainError(error);
  return errorResponse(extracted.code, extracted.message, extracted.details);
}
