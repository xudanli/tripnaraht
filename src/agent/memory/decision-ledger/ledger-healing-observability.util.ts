import type { ReconcileResultV1 } from './incremental-recompute-orchestrator.types';

/** 与 `RouteAndRunResponseDto.observability.ledger_healing` 对齐（v1） */
export type LedgerHealingObservabilityV1 = {
  status: 'CONVERGED' | 'ESCALATED' | 'NO_OP';
  /** 引擎原始状态，便于联调与日志对账 */
  reconcile_status?: string;
  /**
   * 本轮进入 reconcile 前执行器给出的 INVALIDATED 节点 id（与行程卡片 nodeId 对齐，供 UI 闪烁 / 重绘）。
   */
  affected_node_ids?: string[];
  metrics: {
    initial_invalidated: number;
    secondary_invalidated: number;
    loops: number;
  };
  steps: Array<{
    phase: string;
    action: string;
    target_nodes: string[];
  }>;
};

const LOOP_LINE = /^loop_(\d+):/;

function maxSecondaryFromTrace(trace: string[]): number {
  let max = 0;
  for (const line of trace) {
    const m = line.match(/secondary=(\d+)/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return max;
}

function loopCountFromTrace(trace: string[]): number {
  return trace.filter(l => LOOP_LINE.test(l)).length;
}

/** 从 trace 行中提取方括号内的 token（nodeId / 列表片段） */
function targetNodesFromTraceLine(line: string): string[] {
  const out: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const inner = m[1].trim();
    if (!inner) continue;
    for (const part of inner.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)) {
      if (!out.includes(part)) out.push(part);
    }
  }
  return out;
}

function traceToSteps(trace: string[]): LedgerHealingObservabilityV1['steps'] {
  return trace.map(line => ({
    phase: LOOP_LINE.test(line) ? 'merge_loop' : 'kernel',
    action: line,
    target_nodes: targetNodesFromTraceLine(line),
  }));
}

export function buildLedgerHealingObservabilityV1(input: {
  initialInvalidatedCount: number;
  ranBlockingReconcile: boolean;
  reconcileResult?: ReconcileResultV1;
  advisoryDeferred?: boolean;
  skippedMissingDeps?: boolean;
  /** 与 `LedgerRecomputeExecutorResultV1.invalidatedSteps` 对齐 */
  invalidatedNodeIds?: string[];
}): LedgerHealingObservabilityV1 {
  const { initialInvalidatedCount, ranBlockingReconcile, reconcileResult } = input;

  const affectedRaw = input.invalidatedNodeIds ?? [];
  const affected = [...new Set(affectedRaw.map(id => String(id).trim()).filter(Boolean))];
  const affectedBlock = affected.length > 0 ? { affected_node_ids: affected } : {};

  if (!ranBlockingReconcile) {
    const action = input.skippedMissingDeps
      ? 'blocking_reconcile_skipped_missing_deps'
      : input.advisoryDeferred
        ? 'blocking_reconcile_deferred_advisory_phase'
        : 'blocking_reconcile_not_run';
    return {
      status: 'NO_OP',
      metrics: {
        initial_invalidated: initialInvalidatedCount,
        secondary_invalidated: 0,
        loops: 0,
      },
      steps: [{ phase: 'gate', action, target_nodes: [] }],
      ...affectedBlock,
    };
  }

  const trace = reconcileResult?.trace ?? [];
  const rawStatus = reconcileResult?.status ?? 'UNKNOWN';
  const uiStatus: LedgerHealingObservabilityV1['status'] =
    rawStatus === 'CONVERGED' ? 'CONVERGED' : 'ESCALATED';

  return {
    status: uiStatus,
    reconcile_status: rawStatus,
    metrics: {
      initial_invalidated: initialInvalidatedCount,
      secondary_invalidated: maxSecondaryFromTrace(trace),
      loops: loopCountFromTrace(trace),
    },
    steps: traceToSteps(trace),
    ...affectedBlock,
  };
}
