import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { stableDigest } from './decision-ledger-digest.util';
import {
  applyLedgerDependentInvalidationCascade,
  buildLedgerDependentsIndex,
  invalidateLedgerByAnchorDrift,
} from './decision-ledger-invalidation.util';
import {
  LEDGER_LOGIC_CONSTRAINT_VALIDATORS,
  type LedgerLogicConstraintValidator,
} from './ledger-logic-constraint-validator.port';
import type {
  IncrementalKernelDecisionV1,
  LedgerWritebackContextV1,
  LedgerWritebackResultV1,
} from './ledger-writeback.types';
import { syncLedgerNodeInputSignaturesToAnchors } from './ledger-writeback.util';

@Injectable()
export class LedgerWritebackService {
  private readonly logger = new Logger(LedgerWritebackService.name);

  constructor(
    @Optional()
    @Inject(LEDGER_LOGIC_CONSTRAINT_VALIDATORS)
    private readonly logicValidators: LedgerLogicConstraintValidator[] = [],
  ) {}

  /**
   * Validate → Merge（仅 INVALIDATED）→ Domain 逻辑 seeds ∪ 结构依赖 seeds → HARD 级联 → 锚漂移审计。
   * 校验失败时全有或全无：不修改账本。
   */
  mergeIncrementalKernelDecisions(
    currentLedger: DecisionLedgerSnapshot,
    newDecisions: IncrementalKernelDecisionV1[],
    context: LedgerWritebackContextV1,
  ): LedgerWritebackResultV1 {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const d of newDecisions) {
      if (seen.has(d.nodeId)) {
        errors.push(`Duplicate decision for node [${d.nodeId}]`);
      }
      seen.add(d.nodeId);
    }

    const byIdBefore = new Map(currentLedger.nodes.map(n => [n.nodeId, n]));
    for (const d of newDecisions) {
      const cur = byIdBefore.get(d.nodeId);
      if (!cur) {
        errors.push(`Illegal node modification: [${d.nodeId}] does not exist on the ledger.`);
        continue;
      }
      if (cur.status !== 'INVALIDATED') {
        errors.push(
          `Constraint violation: attempted to write non-INVALIDATED node [${d.nodeId}] (status=${cur.status}).`,
        );
      }
    }

    if (errors.length > 0) {
      return {
        ledger: currentLedger,
        secondaryInvalidated: [],
        isStable: false,
        errors,
      };
    }

    const statusBefore = new Map(currentLedger.nodes.map(n => [n.nodeId, n.status]));
    const mergedIds = new Set(newDecisions.map(d => d.nodeId));
    const decisionById = new Map(newDecisions.map(d => [d.nodeId, d]));

    const nextNodes: LedgerNode[] = currentLedger.nodes.map(n => {
      const decision = decisionById.get(n.nodeId);
      if (!decision) {
        return { ...n, inputSignatures: { ...n.inputSignatures } };
      }
      const digest = stableDigest(decision.output);
      const summary =
        (decision.summary && decision.summary.trim()) || n.outputRef.summary?.trim() || undefined;
      return {
        ...n,
        status: 'STABLE' as const,
        createdAt: context.nowMs,
        inputSignatures: syncLedgerNodeInputSignaturesToAnchors(n, currentLedger.anchors),
        outputRef: {
          kind: n.outputRef.kind,
          payloadDigest: digest,
          ...(summary !== undefined ? { summary } : {}),
        },
      };
    });

    let ledger: DecisionLedgerSnapshot = { ...currentLedger, nodes: nextNodes };
    const byId = new Map(ledger.nodes.map(n => [n.nodeId, n]));

    const mergedOutputs = new Map<string, unknown>(newDecisions.map(d => [d.nodeId, d.output]));

    const dependents = buildLedgerDependentsIndex(ledger.nodes);
    const structuralSeeds: string[] = [];
    for (const id of mergedIds) {
      for (const down of dependents.get(id) ?? []) {
        const n = byId.get(down);
        if (n?.status === 'STABLE') structuralSeeds.push(down);
      }
    }

    const domainSeeds: string[] = [];
    for (const v of this.logicValidators) {
      try {
        domainSeeds.push(...v.validate({ ledger, mergedOutputs }));
      } catch (e: any) {
        this.logger.warn(`LedgerWriteback: validator ${v.name} threw: ${e?.message ?? e}`);
      }
    }

    const allSeeds = [...new Set([...structuralSeeds, ...domainSeeds])];
    ledger = applyLedgerDependentInvalidationCascade(ledger, allSeeds, 'HARD');

    const drifted = invalidateLedgerByAnchorDrift(ledger, { memoryPhase: context.memoryPhase });
    ledger = drifted.ledger;

    const secondaryInvalidated = ledger.nodes
      .filter(
        n => n.status === 'INVALIDATED' && statusBefore.get(n.nodeId) === 'STABLE' && !mergedIds.has(n.nodeId),
      )
      .map(n => n.nodeId);

    const isStable = secondaryInvalidated.length === 0;
    this.logger.debug(
      `LedgerWriteback: merged=${mergedIds.size} structural=${structuralSeeds.length} domain=${domainSeeds.length} secondary=${secondaryInvalidated.length} stable=${isStable}`,
    );

    return {
      ledger,
      secondaryInvalidated,
      isStable,
    };
  }
}
