/**
 * Shared Web/iOS HTTP client for UWC-1e (one OpenAPI, one client shape).
 * Does not fork per surface — pass productSurface on each call.
 */

import { UWC_1E_OPENAPI_FREEZE } from './client-write-protocol.openapi.freeze';
import {
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
  type Uwc1eApplyRequest,
  type Uwc1eApplyResponse,
  type Uwc1eConfirmRequest,
  type Uwc1eConfirmResponse,
  type Uwc1ePreviewRequest,
  type Uwc1ePreviewResponse,
  type Uwc1eProtocolReject,
} from './client-write-protocol.types';

export type Uwc1eFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type Uwc1eClientConfig = {
  /** e.g. https://api.example.com/api — no trailing slash */
  baseUrl: string;
  /** Defaults to /uwc/v1 from freeze (appends under baseUrl). */
  protocolPath?: string;
  fetchImpl?: Uwc1eFetch;
  defaultHeaders?: Record<string, string>;
};

export type Uwc1eClientResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; body: Uwc1eProtocolReject | Uwc1eApplyResponse };

function protocolBase(cfg: Uwc1eClientConfig): string {
  const path =
    cfg.protocolPath ??
    UWC_1E_OPENAPI_FREEZE.servers[0]?.url ??
    '/uwc/v1';
  return `${cfg.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function postJson<T>(
  cfg: Uwc1eClientConfig,
  path: string,
  body: unknown,
): Promise<Uwc1eClientResult<T>> {
  const fetchImpl = cfg.fetchImpl ?? (globalThis.fetch as Uwc1eFetch);
  const res = await fetchImpl(`${protocolBase(cfg)}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...cfg.defaultHeaders,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T | Uwc1eProtocolReject | Uwc1eApplyResponse;
  if (!res.ok || (json && typeof json === 'object' && 'errorCode' in json)) {
    return {
      ok: false,
      status: res.status,
      body: json as Uwc1eProtocolReject | Uwc1eApplyResponse,
    };
  }
  return { ok: true, status: res.status, body: json as T };
}

/**
 * Factory used by Web and iOS TypeScript clients alike.
 * On CONFLICT: callers MUST re-preview (do not retry confirm/apply on same draft).
 * On VERIFICATION_REQUIRED / REJECTED: callers MUST NOT bypass.
 */
export function createUwc1eClient(cfg: Uwc1eClientConfig) {
  return {
    schemaId: UWC_1E_SCHEMA_ID,
    protocolVersion: UWC_1E_PROTOCOL_VERSION,
    openApiFreeze: UWC_1E_OPENAPI_FREEZE,
    clientRules: UWC_1E_OPENAPI_FREEZE['x-uwc-client-rules'],

    preview(
      input: Omit<Uwc1ePreviewRequest, 'schemaId' | 'protocolVersion' | 'stage'> &
        Partial<Pick<Uwc1ePreviewRequest, 'schemaId' | 'protocolVersion'>>,
    ) {
      const body: Uwc1ePreviewRequest = {
        schemaId: input.schemaId ?? UWC_1E_SCHEMA_ID,
        protocolVersion: input.protocolVersion ?? UWC_1E_PROTOCOL_VERSION,
        stage: 'PREVIEW',
        productSurface: input.productSurface,
        slice: input.slice,
        tripId: input.tripId,
        actorId: input.actorId,
        intendedMutation: input.intendedMutation,
        expectedWriteVersion: input.expectedWriteVersion,
        observedHints: input.observedHints,
        requestId: input.requestId,
      };
      return postJson<Uwc1ePreviewResponse>(cfg, '/write/preview', body);
    },

    confirm(
      input: Omit<Uwc1eConfirmRequest, 'schemaId' | 'protocolVersion' | 'stage' | 'explicitConfirm'> &
        Partial<Pick<Uwc1eConfirmRequest, 'schemaId' | 'protocolVersion'>>,
    ) {
      const body: Uwc1eConfirmRequest = {
        schemaId: input.schemaId ?? UWC_1E_SCHEMA_ID,
        protocolVersion: input.protocolVersion ?? UWC_1E_PROTOCOL_VERSION,
        stage: 'CONFIRM',
        draftId: input.draftId,
        explicitConfirm: true,
        productSurface: input.productSurface,
        actorId: input.actorId,
        requestId: input.requestId,
      };
      return postJson<Uwc1eConfirmResponse>(cfg, '/write/confirm', body);
    },

    apply(
      input: Omit<Uwc1eApplyRequest, 'schemaId' | 'protocolVersion' | 'stage'> &
        Partial<Pick<Uwc1eApplyRequest, 'schemaId' | 'protocolVersion'>>,
    ) {
      const body: Uwc1eApplyRequest = {
        schemaId: input.schemaId ?? UWC_1E_SCHEMA_ID,
        protocolVersion: input.protocolVersion ?? UWC_1E_PROTOCOL_VERSION,
        stage: 'APPLY',
        draftId: input.draftId,
        confirmationId: input.confirmationId,
        idempotencyKey: input.idempotencyKey,
        productSurface: input.productSurface,
        actorId: input.actorId,
        requestId: input.requestId,
      };
      return postJson<Uwc1eApplyResponse>(cfg, '/write/apply', body);
    },

    /** Client helper — true when HTTP/protocol requires a fresh Preview. */
    mustRePreview(
      result: Uwc1eClientResult<unknown>,
    ): boolean {
      if (result.ok) {
        const body = result.body as { mustRePreview?: boolean; outcome?: string };
        return body.mustRePreview === true || body.outcome === 'CONFLICT';
      }
      const body = result.body as {
        mustRePreview?: boolean;
        outcome?: string;
        errorCode?: string;
      };
      return (
        body.mustRePreview === true ||
        body.outcome === 'CONFLICT' ||
        body.errorCode === 'MUST_REPREVIEW_AFTER_CONFLICT'
      );
    },

    bypassForbidden(
      result: Uwc1eClientResult<unknown>,
    ): boolean {
      if (result.ok) {
        const body = result.body as {
          bypassForbidden?: boolean;
          outcome?: string;
        };
        return (
          body.bypassForbidden === true ||
          body.outcome === 'VERIFICATION_REQUIRED' ||
          body.outcome === 'REJECTED' ||
          body.outcome === 'CONFLICT'
        );
      }
      const body = result.body as {
        bypassForbidden?: boolean;
        errorCode?: string;
        outcome?: string;
      };
      return (
        body.bypassForbidden === true ||
        body.errorCode === 'BYPASS_FORBIDDEN' ||
        body.outcome === 'VERIFICATION_REQUIRED' ||
        body.outcome === 'REJECTED'
      );
    },
  };
}

export type Uwc1eSharedClient = ReturnType<typeof createUwc1eClient>;
