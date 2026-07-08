/**
 * Shared reference handle — attach to Gateway / Preview / Apply without breaking existing payloads.
 */

export const CAUSAL_TRACE_PROTOCOL_VERSION = 'causal-trace-v1' as const;

export type CausalTraceProtocolVersion = typeof CAUSAL_TRACE_PROTOCOL_VERSION;

export interface CausalTraceReference {
  traceId: string;
  worldStateVersion: string;
  protocolVersion: CausalTraceProtocolVersion;
}

export const CAUSAL_TRACE_STALE_ERROR_CODE = 'CAUSAL_TRACE_STALE' as const;

export interface CausalTraceStaleErrorBody {
  code: typeof CAUSAL_TRACE_STALE_ERROR_CODE;
  message: string;
  requiresReevaluation: true;
  expectedWorldStateVersion: string;
  currentWorldStateVersion: string;
  traceId: string;
}
