/**
 * In-process UWC-1e transport for fullstack E2E (no real HTTP listen).
 * Routes createUwc1eClient fetch calls into ClientWriteProtocolService.
 */

import type { Uwc1eFetch } from './client-write-protocol.client';
import { ClientWriteProtocolService } from './client-write-protocol.service';
import type {
  Uwc1eApplyRequest,
  Uwc1eConfirmRequest,
  Uwc1ePreviewRequest,
} from './client-write-protocol.types';

function statusForReject(errorCode: string): number {
  switch (errorCode) {
    case 'MUST_REPREVIEW_AFTER_CONFLICT':
      return 409;
    case 'BYPASS_FORBIDDEN':
      return 403;
    case 'DRAFT_EXPIRED':
      return 410;
    case 'DRAFT_NOT_FOUND':
      return 404;
    case 'EXCLUDED_CAPABILITY':
    case 'SLICE_NOT_IN_FIRST_BATCH':
      return 403;
    default:
      return 400;
  }
}

function statusForOutcome(outcome: string): number {
  switch (outcome) {
    case 'CONFLICT':
      return 409;
    case 'VERIFICATION_REQUIRED':
      return 422;
    case 'REJECTED':
      return 403;
    default:
      return 200;
  }
}

export function createUwc1eInProcessFetch(
  protocol: ClientWriteProtocolService,
): Uwc1eFetch {
  return async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    if (url.includes('/write/preview')) {
      const out = await protocol.preview(body as Uwc1ePreviewRequest);
      if ('errorCode' in out) {
        return {
          ok: false,
          status: statusForReject(out.errorCode),
          json: async () => out,
        };
      }
      return { ok: true, status: 200, json: async () => out };
    }
    if (url.includes('/write/confirm')) {
      const out = await protocol.confirm(body as Uwc1eConfirmRequest);
      if ('errorCode' in out) {
        return {
          ok: false,
          status: statusForReject(out.errorCode),
          json: async () => out,
        };
      }
      return { ok: true, status: 200, json: async () => out };
    }
    if (url.includes('/write/apply')) {
      const out = await protocol.apply(body as Uwc1eApplyRequest);
      if ('errorCode' in out) {
        return {
          ok: false,
          status: statusForReject(out.errorCode),
          json: async () => out,
        };
      }
      const status = statusForOutcome(out.outcome);
      return {
        ok: status === 200,
        status,
        json: async () => out,
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'NOT_FOUND', url }),
    };
  };
}
