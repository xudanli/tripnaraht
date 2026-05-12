/**
 * P19 — Registry of meta-compiler artifacts (DAG / IR-lowering / VM lowering views).
 */

import type { ExecutionCompilerAST } from '../compiler-ast/execution-compiler-ast.types';

export interface SelfCompilerRegistry {
  version: string;
  compilers: {
    dagCompiler: ExecutionCompilerAST;
    irLoweringCompiler: ExecutionCompilerAST;
    vmCompiler: ExecutionCompilerAST;
  };
}

function cloneAst(ast: ExecutionCompilerAST): ExecutionCompilerAST {
  return {
    nodes: [...ast.nodes],
    optimizations: [...ast.optimizations],
    loweringRules: [...ast.loweringRules],
  };
}

/** Partition optimizations by rough phase hint in target string — MVP heuristic. */
export function splitAstByPhase(ast: ExecutionCompilerAST): {
  dag: ExecutionCompilerAST;
  ir: ExecutionCompilerAST;
  vm: ExecutionCompilerAST;
} {
  const dagOpts = ast.optimizations.filter(
    o => o.type === 'DAG_MACRO_NODE' || o.target.includes('DAG') || o.target.includes('EXEC_CHECK'),
  );
  const irOpts = ast.optimizations.filter(
    o =>
      o.type === 'FUSE_INSTRUCTIONS' ||
      o.type === 'BRANCH_ELIMINATION' ||
      o.target.includes('PROJECT') ||
      o.target.includes('TRAVERSE'),
  );
  const dagIds = new Set(dagOpts.map(o => o.id));
  const irIds = new Set(irOpts.map(o => o.id));
  const vmOpts = ast.optimizations.filter(o => !dagIds.has(o.id) && !irIds.has(o.id));

  const baseNodes = ast.nodes;
  return {
    dag: {
      nodes: baseNodes.filter(n => n.kind === 'DAG_PHASE'),
      optimizations: dagOpts.length ? dagOpts : ast.optimizations.slice(0, 1),
      loweringRules: ast.loweringRules.filter(r => r.pattern.includes('ORDER') || r.pattern.includes('STEP')),
    },
    ir: {
      nodes: baseNodes.filter(n => n.kind === 'IR_PHASE'),
      optimizations: irOpts.length ? irOpts : ast.optimizations,
      loweringRules: ast.loweringRules,
    },
    vm: {
      nodes: baseNodes.filter(n => n.kind === 'VM_PHASE'),
      optimizations: vmOpts.length ? vmOpts : ast.optimizations.slice(-1),
      loweringRules: [],
    },
  };
}

export function buildSelfCompilerRegistry(
  ast: ExecutionCompilerAST,
  version: string,
): SelfCompilerRegistry {
  const { dag, ir, vm } = splitAstByPhase(ast);
  return {
    version,
    compilers: {
      dagCompiler: cloneAst(dag),
      irLoweringCompiler: cloneAst(ir),
      vmCompiler: cloneAst(vm),
    },
  };
}

/** Neptune / audit: why this compiler registry version looks the way it does. */
export function explainCompilerRegistry(registry: SelfCompilerRegistry): string[] {
  const lines: string[] = [`Self-compiler registry v${registry.version}`];

  const phases: Array<[string, ExecutionCompilerAST]> = [
    ['DAG compiler', registry.compilers.dagCompiler],
    ['IR lowering compiler', registry.compilers.irLoweringCompiler],
    ['VM/compiler bridge', registry.compilers.vmCompiler],
  ];

  for (const [title, ast] of phases) {
    lines.push(`— ${title}: ${ast.optimizations.length} optimization(s), ${ast.loweringRules.length} lowering rule(s)`);
    for (const o of ast.optimizations) {
      lines.push(
        `    • ${o.type} on ${o.target} → ${o.action} (confidence=${o.confidence.toFixed(2)})`,
      );
    }
  }

  return lines;
}
