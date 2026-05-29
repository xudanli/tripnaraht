import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionRuntimeTickBundle } from './decision-runtime-kernel.types';
import type { IntentCompileSource } from './llm-intent-compiler.service';
import { computeIncrementalResearchScopes } from './compute-incremental-research-scopes.util';
import { mapIncrementalScopesToAssetScopes } from './resolve-research-invalidation.util';

export type DosTickAuditV1 = {
  revision: 'v1';
  tick_id: string;
  request_id: string;
  trip_id: string | null;
  intent_compile_source: IntentCompileSource | 'skipped';
  gray_llm_path: boolean;
  gray_route_reason: string;
  duration_ms: number;
  plan_delta_count: number;
  incremental_scope_count: number;
  invalidated_asset_scopes_count: number;
  latency_ms?: number;
};

type AuditDeps = {
  logger?: { log?: (msg: string) => void; debug?: (msg: string) => void };
  prom?: {
    recordDosTickAudit: (audit: DosTickAuditV1) => void;
  };
};

export function buildDosTickAuditV1(
  request: RouteAndRunRequestDto,
  bundle: DecisionRuntimeTickBundle,
  outcome: RouteAndRunResponseDto,
  wallStartMs: number,
): DosTickAuditV1 {
  const req = request as RouteAndRunRequestDto & {
    __intentCompileSource?: IntentCompileSource;
    __dosGrayRoute?: { llm_compiler_path?: boolean; reason?: string };
    __dosResearchInvalidationAudit?: { asset_scopes_count?: number };
  };

  const dosCtx = bundle.dosExecutionContext;
  const planDeltaCount = dosCtx?.planDelta.length ?? 0;
  let incrementalScopeCount = 0;
  let projectedAssetScopes = 0;
  if (dosCtx && planDeltaCount > 0) {
    const incremental = computeIncrementalResearchScopes(dosCtx);
    incrementalScopeCount = incremental.length;
    projectedAssetScopes = mapIncrementalScopesToAssetScopes(incremental).length;
  }

  const executedScopes =
    req.__dosResearchInvalidationAudit?.asset_scopes_count ??
    projectedAssetScopes;

  const observabilityLatency = (outcome as RouteAndRunResponseDto & {
    observability?: { latency_ms?: number };
  }).observability?.latency_ms;

  return {
    revision: 'v1',
    tick_id: bundle.tickId,
    request_id: request.request_id,
    trip_id: dosCtx?.tripId ?? request.trip_id ?? null,
    intent_compile_source: req.__intentCompileSource ?? 'skipped',
    gray_llm_path: req.__dosGrayRoute?.llm_compiler_path === true,
    gray_route_reason: req.__dosGrayRoute?.reason ?? 'unknown',
    duration_ms: Math.max(0, Date.now() - wallStartMs),
    plan_delta_count: planDeltaCount,
    incremental_scope_count: incrementalScopeCount,
    invalidated_asset_scopes_count: executedScopes,
    ...(observabilityLatency !== undefined ? { latency_ms: observabilityLatency } : {}),
  };
}

export function emitDosTickAudit(
  audit: DosTickAuditV1,
  deps?: AuditDeps,
): void {
  deps?.prom?.recordDosTickAudit(audit);
  deps?.logger?.log?.(
    `[DOS-AUDIT] tick_id=${audit.tick_id} trip_id=${audit.trip_id ?? 'n/a'} ` +
      `source=${audit.intent_compile_source} gray_llm=${audit.gray_llm_path} ` +
      `gray_reason=${audit.gray_route_reason} duration_ms=${audit.duration_ms} ` +
      `deltas=${audit.plan_delta_count} incr_scopes=${audit.incremental_scope_count} ` +
      `asset_scopes=${audit.invalidated_asset_scopes_count}` +
      (audit.latency_ms !== undefined ? ` latency_ms=${audit.latency_ms}` : ''),
  );
}
