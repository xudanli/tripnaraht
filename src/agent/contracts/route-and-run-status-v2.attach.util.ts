import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { AuthorityAuditTraceV1 } from '../../decision-runtime/execution/authority-audit-trace-v1.types';
import type {
  RouteAndRunStatusProjectionInput,
  RouteAndRunStatusV2,
} from './route-and-run-status-v2.types';
import { inferStatusV2FromLegacy } from './route-and-run-status-v2.projection.util';

export const ROUTE_AND_RUN_STATUS_V2_OBS_SCHEMA = 'tripnara.route_and_run.status@v2' as const;

type GuardWithStatusV2 = { statusV2?: RouteAndRunStatusV2 };

function readGuardStatusV2(payload: Record<string, unknown> | undefined): RouteAndRunStatusV2 | undefined {
  if (!payload) return undefined;
  const guard = payload.canonical_mutation_guard as GuardWithStatusV2 | undefined;
  return guard?.statusV2;
}

function readObsGuardStatusV2(
  obs: Record<string, unknown> | undefined,
  key: string,
): RouteAndRunStatusV2 | undefined {
  const guard = obs?.[key] as GuardWithStatusV2 | undefined;
  return guard?.statusV2;
}

function readAuthorityAudit(response: RouteAndRunResponseDto): AuthorityAuditTraceV1 | undefined {
  const audit = (response.observability as Record<string, unknown> | undefined)?.authority_audit_v1;
  if (!audit || typeof audit !== 'object') return undefined;
  if ((audit as AuthorityAuditTraceV1).schemaId !== 'tripnara.authority_audit@v1') return undefined;
  return audit as AuthorityAuditTraceV1;
}

/** Resolve V2 axes from mutation guards, authority audit, or legacy projection hints. */
export function resolveRouteAndRunStatusV2FromResponse(
  response: RouteAndRunResponseDto,
  hints?: RouteAndRunStatusProjectionInput,
): RouteAndRunStatusV2 {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  const fromPayload = readGuardStatusV2(payload);
  if (fromPayload) return fromPayload;

  const obs = (response.observability ?? {}) as Record<string, unknown>;
  for (const key of [
    'legacy_mutation_guard_v1',
    'agentic_mutation_guard_v1',
    'async_mutation_guard_v1',
  ]) {
    const fromObs = readObsGuardStatusV2(obs, key);
    if (fromObs) return fromObs;
  }

  const audit = readAuthorityAudit(response);
  const reasonCodes = audit?.reasonCodes ?? [];

  return inferStatusV2FromLegacy({
    legacyStatus: response.result?.status,
    hasActionPreview: Boolean(
      (payload?.timeline as unknown[] | undefined)?.length ||
        (payload?.candidates as unknown[] | undefined)?.length,
    ),
    tripVersionConflict: reasonCodes.includes('EXECUTION_CONFLICT'),
    evidenceStale:
      audit?.evidence?.freshness === 'EXPIRED' || audit?.evidence?.freshness === 'STALE',
    asyncProcessing: response.result?.status === 'PROCESSING',
    ...hints,
  });
}

/** Attach `observability.result_status_v2` without mutating legacy `result.status`. */
export function attachRouteAndRunStatusV2ToResponse(
  response: RouteAndRunResponseDto,
  hints?: RouteAndRunStatusProjectionInput,
): RouteAndRunResponseDto {
  const statusV2 = resolveRouteAndRunStatusV2FromResponse(response, hints);
  const obs = (response.observability ?? {}) as Record<string, unknown>;
  obs.result_status_v2 = {
    schemaId: ROUTE_AND_RUN_STATUS_V2_OBS_SCHEMA,
    ...statusV2,
  };
  response.observability = obs as RouteAndRunResponseDto['observability'];
  return response;
}

/** Gateway helper: merge request-level hints (e.g. async) into V2 attachment. */
export function attachRouteAndRunStatusV2ForRequest(input: {
  request: RouteAndRunRequestDto;
  response: RouteAndRunResponseDto;
}): RouteAndRunResponseDto {
  return attachRouteAndRunStatusV2ToResponse(input.response, {
    asyncProcessing: input.response.result?.status === 'PROCESSING',
  });
}
