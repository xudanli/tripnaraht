import { Injectable, Optional } from '@nestjs/common';
import type { DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import { LedgerRecomputeExecutorService } from '../../../agent/memory/decision-ledger/ledger-recompute-executor.service';
import { MemorySnapshotPersistenceService } from '../../../agent/memory/persistence/memory-snapshot-persistence.service';
import type { DecisionLedgerRefs, DecisionProblemDetail } from '../types/decision-semantics.types';
import { buildDecisionLedgerRefs } from './build-decision-ledger-refs.util';
import {
  annotateLedgerRefsWithCausality,
  buildCausedByEdges,
  mergeCausedByEdges,
  nodeIdsForCausalityAnnotation,
  resolveDecisionIdFromLedgerNode,
} from './decision-ledger-causality.util';
import { detectLedgerStaleAfterDecision } from './detect-ledger-stale.util';

export interface LedgerSnapshotContext {
  ledger: DecisionLedgerSnapshot;
  snapshotVersion?: number;
}

@Injectable()
export class DecisionLedgerBridgeService {
  constructor(
    @Optional() private readonly persistence?: MemorySnapshotPersistenceService,
    @Optional() private readonly recomputeExecutor?: LedgerRecomputeExecutorService,
  ) {}

  async loadLedgerContext(tripId: string): Promise<LedgerSnapshotContext | null> {
    if (!this.persistence) {
      return null;
    }
    const ctx = await this.persistence.loadLatestContextForTrip(tripId);
    if (!ctx?.decisionLedger) {
      return null;
    }
    return {
      ledger: ctx.decisionLedger,
      snapshotVersion: ctx.snapshotVersion,
    };
  }

  async captureLedgerRefs(input: {
    tripId: string;
    decisionId: string;
    problem: DecisionProblemDetail;
    decidedAt: string;
    ledgerBefore: LedgerSnapshotContext | null;
  }): Promise<DecisionLedgerRefs | undefined> {
    const after = await this.loadLedgerContext(input.tripId);
    const ledgerBefore = input.ledgerBefore?.ledger ?? after?.ledger;
    if (!ledgerBefore) {
      return undefined;
    }

    const ledgerAfter = after?.ledger ?? ledgerBefore;
    const planInvalidatedNodeIds =
      this.recomputeExecutor && ledgerAfter
        ? this.recomputeExecutor
            .buildExecutionPlan(ledgerAfter)
            .invalidatedSteps.map((s) => s.nodeId)
        : [];

    return buildDecisionLedgerRefs({
      decisionId: input.decisionId,
      problem: input.problem,
      ledgerBefore,
      ledgerAfter,
      decidedAt: input.decidedAt,
      planInvalidatedNodeIds,
      ledgerSnapshotVersion: after?.snapshotVersion ?? input.ledgerBefore?.snapshotVersion,
    });
  }

  /**
   * Write caused_by edges to Agent Decision Ledger + return updated refs.
   * Best-effort: skips when persistence unavailable.
   */
  async persistDecisionCausality(
    tripId: string,
    decisionId: string,
    refs: DecisionLedgerRefs,
  ): Promise<DecisionLedgerRefs> {
    if (!this.persistence) {
      return refs;
    }

    const ctx = await this.loadLedgerContext(tripId);
    if (!ctx?.ledger) {
      return refs;
    }

    const nodeIds = nodeIdsForCausalityAnnotation(refs).filter((id) =>
      ctx.ledger.nodes.some((n) => n.nodeId === id),
    );
    if (!nodeIds.length) {
      return refs;
    }

    const edges = buildCausedByEdges(decisionId, nodeIds);
    const nextLedger = mergeCausedByEdges(ctx.ledger, edges);
    await this.persistence.saveLedgerUpdate(tripId, nextLedger);

    return annotateLedgerRefsWithCausality(refs, nodeIds);
  }

  async resolveDecisionForLedgerNode(
    tripId: string,
    ledgerNodeId: string,
  ): Promise<string | undefined> {
    const ctx = await this.loadLedgerContext(tripId);
    if (ctx?.ledger) {
      const fromLedger = resolveDecisionIdFromLedgerNode(ctx.ledger, ledgerNodeId);
      if (fromLedger) return fromLedger;
    }
    return undefined;
  }

  async isLedgerStaleForDecision(tripId: string, record: Parameters<typeof detectLedgerStaleAfterDecision>[0]) {
    const ctx = await this.loadLedgerContext(tripId);
    return detectLedgerStaleAfterDecision(record, ctx?.ledger, ctx?.snapshotVersion);
  }
}
