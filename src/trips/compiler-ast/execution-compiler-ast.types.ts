/**
 * P19 — Compiler AST layer: the Execution OS as its own compilation artifact (meta-compiler description).
 */

export type CompilerPhaseKind = 'DAG_PHASE' | 'IR_PHASE' | 'VM_PHASE';

export interface CompilerNode {
  id: string;
  kind: CompilerPhaseKind;
  label: string;
}

export type CompilerOptimizationKind =
  | 'FOLD_CHECK'
  | 'FUSE_INSTRUCTIONS'
  | 'DAG_MACRO_NODE'
  | 'BRANCH_ELIMINATION';

export interface CompilerOptimization {
  id: string;
  type: CompilerOptimizationKind;
  target: string;
  action: string;
  confidence: number;
}

export interface LoweringRule {
  id: string;
  /** Pattern tag — not evaluated as code. */
  pattern: string;
  replacement: string;
  priority: number;
}

export interface ExecutionCompilerAST {
  nodes: CompilerNode[];
  optimizations: CompilerOptimization[];
  loweringRules: LoweringRule[];
}
