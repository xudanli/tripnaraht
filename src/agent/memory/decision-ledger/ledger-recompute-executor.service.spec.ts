import { Test, TestingModule } from '@nestjs/testing';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { normalizeLedgerAnchorsV1 } from './decision-ledger-world-anchor.util';
import { LedgerRecomputeExecutorService } from './ledger-recompute-executor.service';

describe('LedgerRecomputeExecutorService', () => {
  let svc: LedgerRecomputeExecutorService;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [LedgerRecomputeExecutorService],
    }).compile();
    svc = m.get(LedgerRecomputeExecutorService);
  });

  it('maps INVALIDATED to FULL_REPLAN and STALE to REFRESH_SUMMARY', () => {
    const anchors = normalizeLedgerAnchorsV1({
      budget: 'b',
      preference: 'p',
      policy: 'pol',
      worldLayered: { coarseDigest: 'c', fineDigest: 'f', activeTopics: {} },
    });
    const nodes: LedgerNode[] = [
      {
        nodeId: 'i1',
        parentIds: [],
        consumesNodeIds: [],
        actionType: 'TRANSPORT',
        inputSignatures: {
          budgetAnchor: 'b',
          preferenceAnchor: 'p',
          worldAnchor: anchors.world,
        },
        outputRef: { kind: 't', payloadDigest: '1' },
        status: 'INVALIDATED',
        createdAt: 1,
      },
      {
        nodeId: 's1',
        parentIds: [],
        consumesNodeIds: [],
        actionType: 'POI',
        inputSignatures: {
          budgetAnchor: 'b',
          preferenceAnchor: 'p',
          worldAnchor: anchors.world,
        },
        outputRef: { kind: 'p', payloadDigest: '2' },
        status: 'STALE',
        createdAt: 2,
      },
    ];
    const ledger: DecisionLedgerSnapshot = {
      revision: 'v1',
      nodes,
      edges: [],
      anchors,
    };
    const out = svc.buildExecutionPlan(ledger);
    expect(out.invalidatedSteps).toEqual([
      expect.objectContaining({ nodeId: 'i1', strategy: 'FULL_REPLAN', status: 'INVALIDATED' }),
    ]);
    expect(out.staleSteps).toEqual([
      expect.objectContaining({ nodeId: 's1', strategy: 'REFRESH_SUMMARY', status: 'STALE' }),
    ]);
  });
});
