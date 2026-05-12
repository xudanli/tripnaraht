/**
 * Causal Graph Builder — 将约束 / 修复 / 重规划 / 语义增量收敛为可追溯因果链
 */

import type { PartialReplanResult } from '../replan/partial-replan.executor';
import type { SlotRepairPlan } from '../repair/slot-repair.types';
import type { ConstraintDiff } from '../stream/constraint-stream.types';
import type { CausalGraph, CausalTraceNode } from './causal-trace.model';

/** 已归一化的约束影响描述（任意上游均可映射为此结构） */
export interface ConstraintDiffTraceRef {
  readonly source: string;
  readonly affectedSlots: readonly string[];
  readonly reasonCode: string;
}

export interface BuildCausalGraphContext {
  readonly constraintDiffs?: readonly ConstraintDiffTraceRef[];
  /** 约束流 diff + 来源标签（如 ROAD:F208） */
  readonly streamConstraintDiff?: ConstraintDiff;
  readonly streamConstraintSource?: string;
  readonly repairs?: readonly SlotRepairPlan[];
  readonly partialReplan?: PartialReplanResult;
  /** 最后一次语义增量种类（reducer / stream） */
  readonly semanticDelta?: { readonly kind: string };
  readonly nowMs?: number;
}

function nodeId(kind: string, index: number): string {
  return `causal_${kind}_${index}`;
}

export function buildCausalGraph(context: BuildCausalGraphContext): CausalGraph {
  const nodes: CausalTraceNode[] = [];
  const t = context.nowMs ?? Date.now();
  let i = 0;

  const refs: ConstraintDiffTraceRef[] = [...(context.constraintDiffs ?? [])];
  if (context.streamConstraintDiff && context.streamConstraintSource) {
    refs.push({
      source: context.streamConstraintSource,
      affectedSlots: context.streamConstraintDiff.changedSlots,
      reasonCode: `stream_${context.streamConstraintDiff.severity}_${
        context.streamConstraintDiff.requiresReplan ? 'replan' : 'noop'
      }`,
    });
  }

  for (const d of refs) {
    nodes.push({
      id: nodeId('constraint', i++),
      type: 'CONSTRAINT',
      source: d.source,
      target: d.affectedSlots.join(','),
      reasonCode: d.reasonCode,
      timestamp: t,
    });
    for (const slotId of d.affectedSlots) {
      nodes.push({
        id: nodeId('impact', i++),
        type: 'IMPACT',
        source: d.source,
        target: slotId,
        reasonCode: 'SLOT_IMPACT',
        timestamp: t,
      });
    }
  }

  for (const r of context.repairs ?? []) {
    nodes.push({
      id: nodeId('repair', i++),
      type: 'REPAIR',
      source: r.slotId,
      target: r.action,
      reasonCode: r.action,
      timestamp: t,
    });
  }

  if (context.partialReplan) {
    for (const sid of context.partialReplan.diff.changedSlotIds) {
      nodes.push({
        id: nodeId('replan', i++),
        type: 'REPLAN',
        source: 'partial_replan_engine',
        target: sid,
        reasonCode: 'PARTIAL_REPLAN_SLOT',
        timestamp: t,
      });
    }
  }

  if (context.semanticDelta) {
    nodes.push({
      id: nodeId('mutation', i++),
      type: 'MUTATION',
      source: 'semantic_runtime',
      target: context.semanticDelta.kind,
      reasonCode: 'SEMANTIC_DELTA',
      timestamp: t,
    });
  }

  return { nodes };
}
