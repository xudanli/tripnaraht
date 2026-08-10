/**
 * UWC-1e sealed session handles — pages may read, never mutate protocol tokens.
 * Apply credentials live in a module-private bag; pages cannot forge Apply payloads.
 */

import type { ExpectedWriteVersion } from './expected-write-version';
import type {
  Uwc1eFirstBatchSlice,
  Uwc1eProductSurface,
  Uwc1eWriteDraft,
} from './client-write-protocol.types';

/** Fields pages must never rewrite (contract matrix + E2E assert). */
export const UWC_1E_IMMUTABLE_TOKEN_FIELDS = [
  'previewHash',
  'expectedVersion',
  'verificationProof',
  'confirmationToken',
] as const;

export type Uwc1eImmutableTokenField =
  (typeof UWC_1E_IMMUTABLE_TOKEN_FIELDS)[number];

type PrivateBag = {
  productSurface: Uwc1eProductSurface;
  slice: Uwc1eFirstBatchSlice;
  tripId: string;
  previewHash: string;
  expectedWriteVersion: ExpectedWriteVersion;
  verificationProof: Readonly<{
    kind: 'pending_draft';
    previewId: string;
    capturedAt: string;
  }>;
  confirmationToken?: string;
  confirmedAt?: string;
  expiresAt: string;
};

const privateBag = new Map<string, PrivateBag>();

function deepFreeze<T extends object>(value: T): Readonly<T> {
  Object.freeze(value);
  for (const v of Object.values(value)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      deepFreeze(v as object);
    }
  }
  return value;
}

export type Uwc1eSealedPreviewHandle = Readonly<{
  draftId: string;
  slice: Uwc1eFirstBatchSlice;
  tripId: string;
  productSurface: Uwc1eProductSurface;
  summary: string;
  expiresAt: string;
  /** Display-only frozen copy — mutating it does not affect commit. */
  expectedVersionView: Readonly<ExpectedWriteVersion>;
  previewHashView: string;
}>;

export type Uwc1eSealedConfirmHandle = Readonly<
  Uwc1eSealedPreviewHandle & {
    confirmationIdView: string;
    confirmedAt: string;
  }
>;

export function sealPreviewFromDraft(
  draft: Uwc1eWriteDraft,
): Uwc1eSealedPreviewHandle {
  const verificationProof = deepFreeze({
    kind: 'pending_draft' as const,
    previewId: draft.draftId,
    capturedAt: draft.createdAt,
  });
  privateBag.set(draft.draftId, {
    productSurface: draft.productSurface,
    slice: draft.slice,
    tripId: draft.tripId,
    previewHash: draft.fingerprint,
    expectedWriteVersion: deepFreeze({
      ...draft.expectedWriteVersion,
    }) as ExpectedWriteVersion,
    verificationProof,
    expiresAt: draft.expiresAt,
  });

  return deepFreeze({
    draftId: draft.draftId,
    slice: draft.slice,
    tripId: draft.tripId,
    productSurface: draft.productSurface,
    summary: draft.summary,
    expiresAt: draft.expiresAt,
    expectedVersionView: deepFreeze({
      ...draft.expectedWriteVersion,
    }) as ExpectedWriteVersion,
    previewHashView: draft.fingerprint,
  });
}

export function sealConfirmHandle(
  preview: Uwc1eSealedPreviewHandle,
  confirmationId: string,
  confirmedAt: string,
): Uwc1eSealedConfirmHandle {
  const bag = privateBag.get(preview.draftId);
  if (!bag) {
    throw new Error('UWC_1E_SEAL_BAG_MISSING');
  }
  bag.confirmationToken = confirmationId;
  bag.confirmedAt = confirmedAt;
  return deepFreeze({
    ...preview,
    confirmationIdView: confirmationId,
    confirmedAt,
  });
}

/** Commit-gate only — pages must not import/call. */
export function readSealedCommitMaterial(draftId: string): {
  previewHash: string;
  expectedWriteVersion: ExpectedWriteVersion;
  verificationProof: PrivateBag['verificationProof'];
  confirmationToken: string;
  productSurface: Uwc1eProductSurface;
  expiresAt: string;
} {
  const bag = privateBag.get(draftId);
  if (!bag?.confirmationToken) {
    throw new Error('UWC_1E_CONFIRMATION_TOKEN_REQUIRED');
  }
  return {
    previewHash: bag.previewHash,
    expectedWriteVersion: bag.expectedWriteVersion,
    verificationProof: bag.verificationProof,
    confirmationToken: bag.confirmationToken,
    productSurface: bag.productSurface,
    expiresAt: bag.expiresAt,
  };
}

export function clearUwc1eSealBagForTests(): void {
  privateBag.clear();
}

/**
 * Reject page attempts to feed mutated tokens into commit.
 * Compare against sealed bag — never trust caller-supplied overrides.
 */
export function assertCommitTokensUnforged(input: {
  draftId: string;
  confirmationToken: string;
  previewHash?: string;
  expectedVersion?: ExpectedWriteVersion;
  verificationProof?: { previewId?: string };
}): void {
  const bag = privateBag.get(input.draftId);
  if (!bag) throw new Error('UWC_1E_SEAL_BAG_MISSING');
  if (bag.confirmationToken !== input.confirmationToken) {
    throw new Error('UWC_1E_CONFIRMATION_TOKEN_TAMPER');
  }
  if (
    input.previewHash !== undefined &&
    input.previewHash !== bag.previewHash
  ) {
    throw new Error('UWC_1E_PREVIEW_HASH_TAMPER');
  }
  if (input.expectedVersion !== undefined) {
    if (
      JSON.stringify(input.expectedVersion) !==
      JSON.stringify(bag.expectedWriteVersion)
    ) {
      throw new Error('UWC_1E_EXPECTED_VERSION_TAMPER');
    }
  }
  if (
    input.verificationProof?.previewId !== undefined &&
    input.verificationProof.previewId !== bag.verificationProof.previewId
  ) {
    throw new Error('UWC_1E_VERIFICATION_PROOF_TAMPER');
  }
}
