import {
  isOrtToolsShadowAttachmentFresh,
  isOrtToolsShadowEvidenceStale,
  selectUsableOrtToolsEvaluateShadow,
  stampOrtToolsShadowFreshness,
} from './ortools-shadow-evidence-freshness.util';

describe('ortools shadow evidence freshness (P2)', () => {
  it('detects evidence / snapshot drift', () => {
    expect(
      isOrtToolsShadowEvidenceStale({
        attachmentEvidenceVersionId: 'ev-a',
        currentEvidenceVersionId: 'ev-a',
      }),
    ).toBe(false);
    expect(
      isOrtToolsShadowEvidenceStale({
        attachmentEvidenceVersionId: 'ev-a',
        currentEvidenceVersionId: 'ev-b',
      }),
    ).toBe(true);
    expect(
      isOrtToolsShadowEvidenceStale({
        attachmentSnapshotId: 'snap-1',
        currentSnapshotId: 'snap-2',
      }),
    ).toBe(true);
  });

  it('selectUsable drops stale and authority-flagged attachments', () => {
    const fresh = selectUsableOrtToolsEvaluateShadow({
      attachment: {
        evidenceVersionId: 'ev-1',
        snapshotId: 'ev-1',
        shadowAuthority: false,
      },
      currentEvidenceVersionId: 'ev-1',
      currentSnapshotId: 'ev-1',
    });
    expect(fresh).toBeDefined();

    expect(
      selectUsableOrtToolsEvaluateShadow({
        attachment: {
          evidenceVersionId: 'ev-old',
          snapshotId: 'ev-old',
          shadowAuthority: false,
        },
        currentEvidenceVersionId: 'ev-new',
        currentSnapshotId: 'ev-new',
      }),
    ).toBeUndefined();

    expect(
      selectUsableOrtToolsEvaluateShadow({
        attachment: {
          evidenceVersionId: 'ev-1',
          shadowAuthority: true,
        },
        currentEvidenceVersionId: 'ev-1',
      }),
    ).toBeUndefined();
  });

  it('stamps FRESH / STALE for main-chain observability', () => {
    const stamped = stampOrtToolsShadowFreshness({
      attachment: { evidenceVersionId: 'ev-1', snapshotId: 'ev-1' },
      currentEvidenceVersionId: 'ev-1',
      currentSnapshotId: 'ev-1',
      discardedStalePrior: true,
    });
    expect(stamped.evidenceFreshness).toBe('FRESH');
    expect(stamped.discardedStalePrior).toBe(true);
    expect(stamped.evidenceBoundAt).toBeTruthy();
    expect(
      isOrtToolsShadowAttachmentFresh({
        attachment: stamped,
        currentEvidenceVersionId: 'ev-1',
        currentSnapshotId: 'ev-1',
      }),
    ).toBe(true);

    const stale = stampOrtToolsShadowFreshness({
      attachment: { evidenceVersionId: 'ev-old' },
      currentEvidenceVersionId: 'ev-new',
    });
    expect(stale.evidenceFreshness).toBe('STALE');
  });
});
