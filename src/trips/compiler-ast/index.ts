export type {
  CompilerNode,
  CompilerOptimization,
  CompilerOptimizationKind,
  CompilerPhaseKind,
  ExecutionCompilerAST,
  LoweringRule,
} from './execution-compiler-ast.types';

export type { CompilerExecutionHistoryEntry } from './compiler-execution-history.types';

export {
  deriveBetterLowerings,
  deriveStructuralShortcuts,
  extractHotPaths,
  generateSelfCompiler,
} from './generate-self-compiler';
