import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { MemorySnapshotPersistenceService } from '../persistence/memory-snapshot-persistence.service';
import { buildLedgerEdgesFromNodes } from './decision-ledger-anchors.util';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { planLedgerRecomputeOrder } from './decision-ledger-invalidation.util';
import { normalizeLedgerAnchorsV1 } from './decision-ledger-world-anchor.util';
import { IncrementalRecomputeOrchestratorService } from './incremental-recompute-orchestrator.service';
import type { IncrementalRecomputeLlmPort } from './incremental-recompute-llm.port';
import { LedgerRecomputeExecutorService } from './ledger-recompute-executor.service';
import { LedgerWritebackService } from './ledger-writeback.service';

const wl = { coarseDigest: 'c0', fineDigest: 'f0', activeTopics: { t1: 'd1' } };

function baseAnchors() {
  return normalizeLedgerAnchorsV1({
    budget: 'b0',
    preference: 'p0',
    policy: 'pol0',
    worldLayered: wl,
  });
}

function alignedSig(anchors: ReturnType<typeof baseAnchors>) {
  return {
    budgetAnchor: anchors.budget,
    preferenceAnchor: anchors.preference,
    policyAnchor: anchors.policy,
    worldAnchor: anchors.world,
    worldCoarseDigestAtCommit: anchors.worldLayered.coarseDigest,
    worldTopicDigestsAtCommit: { ...anchors.worldLayered.activeTopics },
  };
}

function snap(nodes: LedgerNode[]): DecisionLedgerSnapshot {
  const anchors = baseAnchors();
  const cloned = nodes.map(n => {
    const x = JSON.parse(JSON.stringify(n)) as LedgerNode;
    x.inputSignatures = { ...alignedSig(anchors), ...x.inputSignatures };
    x.invalidationPolicy = x.invalidationPolicy ?? {
      budget: 'normal',
      preference: 'normal',
      world: 'normal',
      policy: 'normal',
    };
    return x;
  });
  return {
    revision: 'v1',
    nodes: cloned,
    edges: buildLedgerEdgesFromNodes(cloned),
    anchors,
  };
}

function minContext(ledger: DecisionLedgerSnapshot): AgentMemoryContext {
  return {
    snapshotId: 'snap-seed',
    snapshotVersion: 1,
    requestId: 'req-1',
    userId: 'u1',
    tripId: 'trip-orch',
    userProfile: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: ledger,
    ledgerRecomputePlan: planLedgerRecomputeOrder(ledger),
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    loadedAt: new Date().toISOString(),
    observability: { layers: [] },
  };
}

describe('IncrementalRecomputeOrchestratorService', () => {
  const transportInv: LedgerNode = {
    nodeId: 'T_TRANS',
    parentIds: [],
    consumesNodeIds: [],
    actionType: 'TRANSPORT',
    inputSignatures: alignedSig(baseAnchors()),
    outputRef: { kind: 'transport', payloadDigest: 'old' },
    status: 'INVALIDATED',
    createdAt: 1,
  };

  const hotelStable: LedgerNode = {
    nodeId: 'H_HOTEL',
    parentIds: ['T_TRANS'],
    consumesNodeIds: [],
    actionType: 'ACCOMMODATION',
    inputSignatures: alignedSig(baseAnchors()),
    outputRef: { kind: 'hotel', payloadDigest: 'h0', summary: 'Vik' },
    status: 'STABLE',
    createdAt: 2,
  };

  it('两轮 LLM：先修交通次生酒店失效，再修酒店后收敛并持久化', async () => {
    let memCtx = minContext(snap([transportInv, hotelStable]));
    const persistence: Pick<MemorySnapshotPersistenceService, 'loadLatestContextForTrip' | 'saveLedgerUpdate'> = {
      loadLatestContextForTrip: jest.fn(async () => memCtx),
      saveLedgerUpdate: jest.fn(async (_tripId, ledger) => {
        memCtx = {
          ...memCtx,
          decisionLedger: ledger,
          ledgerRecomputePlan: planLedgerRecomputeOrder(ledger),
          snapshotVersion: memCtx.snapshotVersion + 1,
          snapshotId: `snap-${memCtx.snapshotVersion + 1}`,
        };
        return memCtx;
      }),
    };

    let llmRound = 0;
    const llm: IncrementalRecomputeLlmPort = {
      chat: jest.fn(async () => {
        llmRound += 1;
        if (llmRound === 1) {
          return '```json\n[{"nodeId":"T_TRANS","output":{"arrival":"10:00"}}]\n```';
        }
        return '[{"nodeId":"H_HOTEL","output":{"room":"201"}}]';
      }),
    };

    const orchestrator = new IncrementalRecomputeOrchestratorService(
      persistence as unknown as MemorySnapshotPersistenceService,
      new LedgerRecomputeExecutorService(),
      new LedgerWritebackService([]),
      llm,
    );

    const res = await orchestrator.reconcile('trip-orch', { maxRetries: 3 });
    expect(res.status).toBe('CONVERGED');
    expect(res.finalLedger?.nodes.find(n => n.nodeId === 'T_TRANS')?.status).toBe('STABLE');
    expect(res.finalLedger?.nodes.find(n => n.nodeId === 'H_HOTEL')?.status).toBe('STABLE');
    expect(persistence.saveLedgerUpdate).toHaveBeenCalledTimes(1);
    expect(llm.chat).toHaveBeenCalledTimes(2);
    expect(res.trace.some(t => t.includes('secondary=1'))).toBe(true);
    expect(res.snapshotVersion).toBe(2);
  });

  it('无 INVALIDATED 时 IDLE', async () => {
    const tStable = { ...transportInv, status: 'STABLE' as const };
    const ledger = snap([tStable, hotelStable]);
    let memCtx = minContext(ledger);
    const persistence = {
      loadLatestContextForTrip: jest.fn(async () => memCtx),
      saveLedgerUpdate: jest.fn(),
    };
    const orchestrator = new IncrementalRecomputeOrchestratorService(
      persistence as unknown as MemorySnapshotPersistenceService,
      new LedgerRecomputeExecutorService(),
      new LedgerWritebackService([]),
      { chat: jest.fn(async () => '[]') },
    );
    const res = await orchestrator.reconcile('trip-orch');
    expect(res.status).toBe('IDLE');
    expect(persistence.saveLedgerUpdate).not.toHaveBeenCalled();
  });

  it('次生命中 LOGISTICS 时短路为 ESCALATED_HARD_CONSTRAINT', async () => {
    const visaStable: LedgerNode = {
      nodeId: 'V_VISA',
      parentIds: ['T_TRANS'],
      consumesNodeIds: [],
      actionType: 'LOGISTICS',
      inputSignatures: alignedSig(baseAnchors()),
      outputRef: { kind: 'visa', payloadDigest: 'v0', summary: 'Schengen ok' },
      status: 'STABLE',
      createdAt: 3,
    };
    let memCtx = minContext(snap([transportInv, visaStable]));
    const persistence = {
      loadLatestContextForTrip: jest.fn(async () => memCtx),
      saveLedgerUpdate: jest.fn(),
    };
    const llm: IncrementalRecomputeLlmPort = {
      chat: jest.fn(async () => '[{"nodeId":"T_TRANS","output":{"leg":"KEF"}}]'),
    };
    const orchestrator = new IncrementalRecomputeOrchestratorService(
      persistence as unknown as MemorySnapshotPersistenceService,
      new LedgerRecomputeExecutorService(),
      new LedgerWritebackService([]),
      llm,
    );
    const res = await orchestrator.reconcile('trip-orch', { maxRetries: 5 });
    expect(res.status).toBe('ESCALATED_HARD_CONSTRAINT');
    expect(res.reason).toContain('V_VISA');
    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(persistence.saveLedgerUpdate).not.toHaveBeenCalled();
  });

  it('未注入 LLM 时 LLM_NOT_CONFIGURED', async () => {
    const orchestrator = new IncrementalRecomputeOrchestratorService(
      { loadLatestContextForTrip: jest.fn(), saveLedgerUpdate: jest.fn() } as unknown as MemorySnapshotPersistenceService,
      new LedgerRecomputeExecutorService(),
      new LedgerWritebackService([]),
      undefined,
    );
    const res = await orchestrator.reconcile('x');
    expect(res.status).toBe('LLM_NOT_CONFIGURED');
  });
});
