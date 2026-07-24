/**
 * Evidence / snapshot freshness for OR-Tools shadow (ADR-008 §7 / P2).
 * Stale attachments must not be reused on evaluate / finalize / apply chains.
 */

export type OrtToolsShadowEvidenceFreshness = 'FRESH' | 'STALE';

export function isOrtToolsShadowEvidenceStale(input: {
  attachmentEvidenceVersionId?: string | null;
  attachmentSnapshotId?: string | null;
  currentEvidenceVersionId?: string | null;
  currentSnapshotId?: string | null;
}): boolean {
  const attEv = input.attachmentEvidenceVersionId?.trim() || '';
  const curEv = input.currentEvidenceVersionId?.trim() || '';
  if (attEv && curEv && attEv !== curEv) return true;

  const attSnap = input.attachmentSnapshotId?.trim() || '';
  const curSnap = input.currentSnapshotId?.trim() || '';
  if (attSnap && curSnap && attSnap !== curSnap) return true;

  return false;
}

export interface OrtToolsShadowEvidenceBinding {
  evidenceVersionId?: string | null;
  snapshotId?: string | null;
}

/** True when an attachment may be consumed for observation (never authority). */
export function isOrtToolsShadowAttachmentFresh(input: {
  attachment?: OrtToolsShadowEvidenceBinding | null;
  currentEvidenceVersionId?: string | null;
  currentSnapshotId?: string | null;
}): boolean {
  if (!input.attachment) return false;
  return !isOrtToolsShadowEvidenceStale({
    attachmentEvidenceVersionId: input.attachment.evidenceVersionId,
    attachmentSnapshotId: input.attachment.snapshotId,
    currentEvidenceVersionId: input.currentEvidenceVersionId,
    currentSnapshotId: input.currentSnapshotId,
  });
}

/**
 * Workspace/main-chain resolver: drop stale shadow; never elevate authority.
 */
export function selectUsableOrtToolsEvaluateShadow<
  T extends OrtToolsShadowEvidenceBinding & { shadowAuthority?: boolean },
>(input: {
  attachment?: T | null;
  currentEvidenceVersionId?: string | null;
  currentSnapshotId?: string | null;
}): T | undefined {
  if (!input.attachment) return undefined;
  if (input.attachment.shadowAuthority === true) {
    // Defense: never treat authority-flagged shadow as usable
    return undefined;
  }
  if (
    !isOrtToolsShadowAttachmentFresh({
      attachment: input.attachment,
      currentEvidenceVersionId: input.currentEvidenceVersionId,
      currentSnapshotId: input.currentSnapshotId,
    })
  ) {
    return undefined;
  }
  return input.attachment;
}

export function stampOrtToolsShadowFreshness<
  T extends OrtToolsShadowEvidenceBinding,
>(input: {
  attachment: T;
  currentEvidenceVersionId?: string | null;
  currentSnapshotId?: string | null;
  discardedStalePrior?: boolean;
}): T & {
  evidenceFreshness: OrtToolsShadowEvidenceFreshness;
  discardedStalePrior?: boolean;
  evidenceBoundAt: string;
} {
  const stale = isOrtToolsShadowEvidenceStale({
    attachmentEvidenceVersionId: input.attachment.evidenceVersionId,
    attachmentSnapshotId: input.attachment.snapshotId,
    currentEvidenceVersionId: input.currentEvidenceVersionId,
    currentSnapshotId: input.currentSnapshotId,
  });
  return {
    ...input.attachment,
    evidenceFreshness: stale ? 'STALE' : 'FRESH',
    discardedStalePrior: input.discardedStalePrior || undefined,
    evidenceBoundAt: new Date().toISOString(),
  };
}
