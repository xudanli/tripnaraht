import { randomUUID } from 'crypto';
import type { StandardResponse } from '../../common/dto/standard-response.dto';
import { errorResponse, successResponse } from '../../common/dto/standard-response.dto';

export interface MobileEnvelopeMeta {
  requestId?: string;
  tripId?: string;
  contextVersion?: number;
  planVersion?: number;
  serverTime?: string;
}

export function extractEnvelopeFromData(data: unknown): Pick<MobileEnvelopeMeta, 'contextVersion' | 'planVersion'> {
  if (!data || typeof data !== 'object') return {};
  const row = data as Record<string, unknown>;
  return {
    contextVersion: typeof row.contextVersion === 'number' ? row.contextVersion : undefined,
    planVersion: typeof row.planVersion === 'number' ? row.planVersion : undefined,
  };
}

export function buildMobileEnvelopeMeta(
  tripId: string,
  data?: unknown,
  requestId?: string,
): MobileEnvelopeMeta {
  const extracted = extractEnvelopeFromData(data);
  return {
    requestId: requestId ?? randomUUID(),
    tripId,
    serverTime: new Date().toISOString(),
    ...extracted,
  };
}

export function mobileSuccessResponse<T>(
  data: T,
  meta: MobileEnvelopeMeta,
): StandardResponse<T> {
  return {
    ...successResponse(data),
    ...meta,
  };
}

export function mobileErrorResponse(
  code: string,
  message: string,
  meta: MobileEnvelopeMeta,
  details?: Record<string, unknown>,
): StandardResponse {
  return {
    ...errorResponse(code, message, details),
    ...meta,
  };
}
