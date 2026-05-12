/**
 * Synthesizes a self-describing compiler AST from execution history + P18 self-model.
 * Does **not** rewrite `compileDAGToIR` — produces metadata for registry / promotion pipelines.
 */

import { createHash } from 'crypto';
import type { ExecutionSelfModel } from '../self-model/execution-self-model.types';
import type { CompilerExecutionHistoryEntry } from './compiler-execution-history.types';
import type {
  CompilerNode,
  CompilerOptimization,
  ExecutionCompilerAST,
  LoweringRule,
} from './execution-compiler-ast.types';

function optId(seed: string): string {
  return createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 16);
}

export function extractHotPaths(
  executionHistory: CompilerExecutionHistoryEntry[],
): CompilerOptimization[] {
  const out: CompilerOptimization[] = [];
  if (!executionHistory.length) {
    return out;
  }

  const okRate =
    executionHistory.filter(h => h.vmOk).length / executionHistory.length;
  const avgCheckFail =
    executionHistory.reduce((a, h) => a + (h.checkFailureCount ?? 0), 0) /
    executionHistory.length;

  if (okRate > 0.88 && avgCheckFail < 0.15) {
    out.push({
      id: optId('fold_check'),
      type: 'FOLD_CHECK',
      target: 'EXEC_CHECK:road-feasibility',
      action: 'STATICIZE',
      confidence: Math.min(0.95, okRate * 0.85),
    });
  }

  if (okRate > 0.85) {
    out.push({
      id: optId('fuse_block'),
      type: 'FUSE_INSTRUCTIONS',
      target: 'CHECK→PROJECT→PROJECT→TRAVERSE',
      action: 'FUSED_EXEC_BLOCK',
      confidence: 0.62,
    });
  }

  return out;
}

export function deriveBetterLowerings(selfModel: ExecutionSelfModel): LoweringRule[] {
  return selfModel.compilerDriftSignals.map((s, i) => ({
    id: `lowering_${s.id}_${i}`,
    pattern: s.kind,
    replacement: `lower:${s.kind}:v${selfModel.version}`,
    priority: Math.min(1, Math.max(0, s.magnitude)),
  }));
}

export function deriveStructuralShortcuts(
  executionHistory: CompilerExecutionHistoryEntry[],
): CompilerOptimization[] {
  const out: CompilerOptimization[] = [];
  const repeats = executionHistory.filter(h => h.recurringSubgraphCollapses).length;
  if (executionHistory.length && repeats / executionHistory.length > 0.4) {
    out.push({
      id: optId('dag_macro'),
      type: 'DAG_MACRO_NODE',
      target: 'subgraph:transport-chain',
      action: 'MACRO_EXPAND_INLINE',
      confidence: 0.55,
    });
  }
  return out;
}

function defaultPipelineNodes(): CompilerNode[] {
  return [
    { id: 'phase_dag', kind: 'DAG_PHASE', label: 'dag_to_compiler_ast' },
    { id: 'phase_ir', kind: 'IR_PHASE', label: 'ast_lowering_to_ir' },
    { id: 'phase_vm', kind: 'VM_PHASE', label: 'ir_bytecode_vm' },
  ];
}

export function generateSelfCompiler(
  executionHistory: CompilerExecutionHistoryEntry[],
  selfModel: ExecutionSelfModel,
): ExecutionCompilerAST {
  const optimizations: CompilerOptimization[] = [
    ...extractHotPaths(executionHistory),
    ...deriveStructuralShortcuts(executionHistory),
  ];

  const loweringRules = deriveBetterLowerings(selfModel);

  return {
    nodes: defaultPipelineNodes(),
    optimizations,
    loweringRules,
  };
}
