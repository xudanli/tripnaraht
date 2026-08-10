/**
 * UWC-1e Apply commit gate — app shell / coordinator only.
 * Pages must import page-api, never this module.
 */

import type { Uwc1eSharedClient, Uwc1eClientResult } from './client-write-protocol.client';
import type { Uwc1eApplyResponse, Uwc1eProtocolReject } from './client-write-protocol.types';
import {
  assertCommitTokensUnforged,
  readSealedCommitMaterial,
  type Uwc1eSealedConfirmHandle,
} from './client-write-protocol.seal';

export type Uwc1eCommitResult =
  | {
      ok: true;
      body: Uwc1eApplyResponse;
      mustRePreview: boolean;
      bypassForbidden: boolean;
    }
  | {
      ok: false;
      body: Uwc1eProtocolReject | Uwc1eApplyResponse;
      mustRePreview: boolean;
      bypassForbidden: boolean;
      status: number;
    };

/**
 * Sole Apply entry for first-batch writebacks.
 * Ignores any caller-supplied token overrides; uses sealed bag only.
 */
export function createUwc1eCommitGate(client: Uwc1eSharedClient) {
  return {
    async commit(
      confirmed: Uwc1eSealedConfirmHandle,
      input: { idempotencyKey: string; actorId?: string; requestId?: string },
    ): Promise<Uwc1eCommitResult> {
      const material = readSealedCommitMaterial(confirmed.draftId);
      if (Date.parse(material.expiresAt) < Date.now()) {
        return {
          ok: false,
          status: 410,
          mustRePreview: true,
          bypassForbidden: true,
          body: {
            schemaId: 'tripnara.uwc_client_write_protocol@v1',
            protocolVersion: '1.0.0',
            stage: 'APPLY',
            outcome: 'REJECTED',
            errorCode: 'DRAFT_EXPIRED',
            reasonCodes: ['DRAFT_EXPIRED', 'MUST_REPREVIEW'],
            mustRePreview: true,
            bypassForbidden: true,
          },
        };
      }

      assertCommitTokensUnforged({
        draftId: confirmed.draftId,
        confirmationToken: material.confirmationToken,
        previewHash: confirmed.previewHashView,
        expectedVersion: confirmed.expectedVersionView,
        verificationProof: { previewId: confirmed.draftId },
      });

      // Apply uses server-sealed draftId + confirmationToken only.
      const result: Uwc1eClientResult<Uwc1eApplyResponse> = await client.apply({
        draftId: confirmed.draftId,
        confirmationId: material.confirmationToken,
        idempotencyKey: input.idempotencyKey,
        productSurface: material.productSurface,
        actorId: input.actorId,
        requestId: input.requestId,
      });

      const mustRePreview = client.mustRePreview(result);
      const bypassForbidden = client.bypassForbidden(result);

      if (!result.ok) {
        return {
          ok: false,
          status: result.status,
          body: result.body,
          mustRePreview,
          bypassForbidden,
        };
      }

      return {
        ok: true,
        body: result.body,
        mustRePreview,
        bypassForbidden,
      };
    },
  };
}

export type Uwc1eCommitGate = ReturnType<typeof createUwc1eCommitGate>;

/** Marker for contract matrix — auto-undo / compensation not offered. */
export const UWC_1E_CLIENT_COMMIT_POLICY = {
  autoUndo: false,
  mixedTargets: false,
  icelandMobileWriteback: false,
  globalOccUnlock: true,
  compensationExec: true,
  pagesMayCallApply: false,
  pagesMayMutateTokens: false,
} as const;
