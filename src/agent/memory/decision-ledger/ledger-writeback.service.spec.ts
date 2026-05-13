import { buildLedgerEdgesFromNodes } from './decision-ledger-anchors.util';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { normalizeLedgerAnchorsV1 } from './decision-ledger-world-anchor.util';
import type { LedgerLogicConstraintValidator } from './ledger-logic-constraint-validator.port';
import { LedgerWritebackService } from './ledger-writeback.service';
import { TimelineLedgerLogicConstraintValidator } from './ledger-timeline-logic-constraint.validator';

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
    if (!x.invalidationPolicy) {
      x.invalidationPolicy = { budget: 'normal', preference: 'normal', world: 'normal', policy: 'normal' };
    }
    return x;
  });
  return {
    revision: 'v1',
    nodes: cloned,
    edges: buildLedgerEdgesFromNodes(cloned),
    anchors,
  };
}

describe('LedgerWritebackService', () => {
  const svc = new LedgerWritebackService();
  const ctx = { memoryPhase: 'PLANNING' as const, nowMs: 1_700_000_000_000 };

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
    outputRef: { kind: 'hotel', payloadDigest: 'h0', summary: 'Vik check-in 18:00' },
    status: 'STABLE',
    createdAt: 2,
  };

  it('非法 nodeId：全有或全无，返回原 ledger 引用', () => {
    const ledger = snap([transportInv]);
    const res = svc.mergeIncrementalKernelDecisions(ledger, [{ nodeId: 'MISSING', output: { x: 1 } }], ctx);
    expect(res.ledger).toBe(ledger);
    expect(res.errors?.length).toBeGreaterThan(0);
    expect(res.isStable).toBe(false);
    expect(res.secondaryInvalidated).toEqual([]);
  });

  it('禁止写回 STABLE 节点', () => {
    const stableOnly: LedgerNode = { ...transportInv, nodeId: 'S', status: 'STABLE' };
    const ledger = snap([stableOnly]);
    const res = svc.mergeIncrementalKernelDecisions(ledger, [{ nodeId: 'S', output: {} }], ctx);
    expect(res.ledger).toBe(ledger);
    expect(res.errors?.some(e => e.includes('non-INVALIDATED'))).toBe(true);
  });

  it('同一批次重复 nodeId 报错', () => {
    const ledger = snap([transportInv]);
    const res = svc.mergeIncrementalKernelDecisions(
      ledger,
      [
        { nodeId: 'T_TRANS', output: { a: 1 } },
        { nodeId: 'T_TRANS', output: { b: 2 } },
      ],
      ctx,
    );
    expect(res.ledger).toBe(ledger);
    expect(res.errors?.some(e => e.includes('Duplicate'))).toBe(true);
  });

  it('成功写回 INVALIDATED：digest 更新、锚对齐、无次生', () => {
    const ledger = snap([transportInv]);
    const res = svc.mergeIncrementalKernelDecisions(
      ledger,
      [{ nodeId: 'T_TRANS', output: { route: 'KEF-ARN' }, summary: 'New flight leg' }],
      ctx,
    );
    expect(res.errors).toBeUndefined();
    expect(res.isStable).toBe(true);
    expect(res.secondaryInvalidated).toEqual([]);
    const t = res.ledger.nodes.find(n => n.nodeId === 'T_TRANS');
    expect(t?.status).toBe('STABLE');
    expect(t?.outputRef.summary).toBe('New flight leg');
    expect(t?.inputSignatures.budgetAnchor).toBe(ledger.anchors.budget);
  });

  it('结构性次生失效：上游交通写回后，下游仍 STABLE 的酒店进入 INVALIDATED', () => {
    const ledger = snap([transportInv, hotelStable]);
    const res = svc.mergeIncrementalKernelDecisions(ledger, [{ nodeId: 'T_TRANS', output: { arrival: '22:00' } }], ctx);
    expect(res.errors).toBeUndefined();
    expect(res.secondaryInvalidated).toEqual(['H_HOTEL']);
    expect(res.isStable).toBe(false);
    const h = res.ledger.nodes.find(n => n.nodeId === 'H_HOTEL');
    expect(h?.status).toBe('INVALIDATED');
    const t = res.ledger.nodes.find(n => n.nodeId === 'T_TRANS');
    expect(t?.status).toBe('STABLE');
  });

  it('领域验证器 seed 可与结构级联合并（无依赖边时仅靠 domain seed）', () => {
    const domainOnly: LedgerLogicConstraintValidator = {
      name: 'TEST_DOMAIN',
      validate: ctx =>
        ctx.ledger.nodes.filter(n => n.nodeId === 'ORPHAN' && n.status === 'STABLE').map(n => n.nodeId),
    };
    const orphan: LedgerNode = {
      nodeId: 'ORPHAN',
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'POI',
      inputSignatures: alignedSig(baseAnchors()),
      outputRef: { kind: 'x', payloadDigest: 'o' },
      status: 'STABLE',
      createdAt: 3,
      invalidationPolicy: { budget: 'normal', preference: 'normal', world: 'normal', policy: 'normal' },
    };
    const svcDomain = new LedgerWritebackService([domainOnly]);
    const ledger = snap([transportInv, orphan]);
    const res = svcDomain.mergeIncrementalKernelDecisions(ledger, [{ nodeId: 'T_TRANS', output: { a: 1 } }], ctx);
    expect(res.secondaryInvalidated).toContain('ORPHAN');
  });

  it('时间线验证器：arrivalEpoch 晚于住宿摘要中的 checkInLatestEpoch 时次生失效', () => {
    const hotelLate: LedgerNode = {
      ...hotelStable,
      outputRef: { kind: 'hotel', payloadDigest: 'h', summary: 'checkInLatestEpoch: 100' },
    };
    const svcTimeline = new LedgerWritebackService([new TimelineLedgerLogicConstraintValidator()]);
    const ledger = snap([transportInv, hotelLate]);
    const res = svcTimeline.mergeIncrementalKernelDecisions(
      ledger,
      [{ nodeId: 'T_TRANS', output: { arrivalEpoch: 500 } }],
      ctx,
    );
    expect(res.secondaryInvalidated).toContain('H_HOTEL');
  });
});
