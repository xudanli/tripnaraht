import type { LedgerNode } from './decision-ledger.types';
import { normalizeLedgerAnchorsV1 } from './decision-ledger-world-anchor.util';
import { syncLedgerNodeInputSignaturesToAnchors } from './ledger-writeback.util';

describe('syncLedgerNodeInputSignaturesToAnchors', () => {
  it('将预算/偏好/世界 topic digest 对齐到当前锚', () => {
    const anchors = normalizeLedgerAnchorsV1({
      budget: 'b-new',
      preference: 'p-new',
      policy: 'pol-new',
      worldLayered: { coarseDigest: 'c2', fineDigest: 'f2', activeTopics: { tx: 'dx' } },
    });
    const n: LedgerNode = {
      nodeId: 'n1',
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'POI',
      inputSignatures: {
        budgetAnchor: 'old',
        preferenceAnchor: 'old',
        policyAnchor: 'old',
        worldAnchor: 'old',
        worldCoarseDigestAtCommit: 'old',
        worldTopicDigestsAtCommit: { tx: 'old' },
      },
      outputRef: { kind: 'k', payloadDigest: 'x' },
      status: 'STABLE',
      createdAt: 1,
    };
    const next = syncLedgerNodeInputSignaturesToAnchors(n, anchors);
    expect(next.budgetAnchor).toBe('b-new');
    expect(next.preferenceAnchor).toBe('p-new');
    expect(next.policyAnchor).toBe('pol-new');
    expect(next.worldAnchor).toBe(anchors.world);
    expect(next.worldCoarseDigestAtCommit).toBe('c2');
    expect(next.worldTopicDigestsAtCommit).toEqual({ tx: 'dx' });
  });
});
