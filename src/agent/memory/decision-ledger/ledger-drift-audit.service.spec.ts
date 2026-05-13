import { Test, TestingModule } from '@nestjs/testing';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import {
  buildWorldAnchorV1FromSlices,
  buildWorldTopicSlicesFromTripContext,
  normalizeLedgerAnchorsV1,
  serializeWorldAnchorComposite,
} from './decision-ledger-world-anchor.util';
import { LedgerDriftAuditService } from './ledger-drift-audit.service';
import { LedgerRecomputeExecutorService } from './ledger-recompute-executor.service';

describe('LedgerDriftAuditService', () => {
  let svc: LedgerDriftAuditService;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [LedgerDriftAuditService, LedgerRecomputeExecutorService],
    }).compile();
    svc = m.get(LedgerDriftAuditService);
  });

  it('auditWorldSlicesAndPlan applies WORLD change and returns execution plan', () => {
    const slices0 = buildWorldTopicSlicesFromTripContext({
      recentWorldDecisions: [],
      activeTripState: null,
      nowMs: 1_000_000,
    });
    const wl0 = buildWorldAnchorV1FromSlices(slices0);
    const anchors0 = normalizeLedgerAnchorsV1({
      budget: 'b',
      preference: 'p',
      policy: 'pol',
      worldLayered: wl0,
    });
    const n: LedgerNode = {
      nodeId: 't1',
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'TRANSPORT',
      inputSignatures: {
        budgetAnchor: 'b',
        preferenceAnchor: 'p',
        worldAnchor: serializeWorldAnchorComposite(wl0),
      },
      outputRef: { kind: 'x', payloadDigest: '1' },
      status: 'STABLE',
      createdAt: 1,
      invalidationPolicy: { world: 'normal' },
    };
    const ledger: DecisionLedgerSnapshot = {
      revision: 'v1',
      nodes: [n],
      edges: [],
      anchors: anchors0,
      worldSlices: slices0,
    };

    const slices1 = buildWorldTopicSlicesFromTripContext({
      recentWorldDecisions: [],
      activeTripState: { constraints: { budget: { max: 9999 } } } as any,
      nowMs: 2_000_000,
    });

    const report = svc.auditWorldSlicesAndPlan({
      currentLedger: ledger,
      updatedSlices: slices1,
      phase: 'PLANNING',
      nowMs: 2_000_000,
    });

    expect(report.hasDrift).toBe(true);
    expect(report.impactMetrics.invalidatedCount + report.impactMetrics.staleCount).toBeGreaterThan(0);
    expect(report.updatedLedger.worldSlices?.length).toBe(slices1.length);
    expect(report.executionPlan.invalidatedSteps.length + report.executionPlan.staleSteps.length).toBeGreaterThan(0);
  });
});
