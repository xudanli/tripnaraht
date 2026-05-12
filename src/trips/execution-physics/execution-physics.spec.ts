import type { ExecutionCompilerAST } from '../compiler-ast/execution-compiler-ast.types';
import {
  compileExecutionPhysics,
  detectPhysicsDrift,
  explainPhysicsInterpretation,
  rewriteCausalityModel,
  type PhysicsObservationHistory,
} from './index';

describe('execution-physics (P20)', () => {
  const emptyAst: ExecutionCompilerAST = {
    nodes: [],
    optimizations: [],
    loweringRules: [],
  };

  it('rewriteCausalityModel shifts to probabilistic causality when conflicts dominate', () => {
    const history: PhysicsObservationHistory = {
      entries: Array.from({ length: 10 }, () => ({
        causalConflict: true,
        branchCount: 2,
      })),
    };
    const model = rewriteCausalityModel(history, emptyAst, [{ vmOk: true }]);
    expect(model.causalityModel).toBe('PROBABILISTIC_CAUSALITY');
  });

  it('detectPhysicsDrift surfaces time skew', () => {
    const history: PhysicsObservationHistory = {
      entries: [{ timeSkew: 0.4 }],
    };
    const drifts = detectPhysicsDrift(history);
    expect(drifts.some(d => d.kind === 'TIME_MODEL_MISMATCH')).toBe(true);
  });

  it('compileExecutionPhysics merges AST footprint into compiled physics', () => {
    const ast: ExecutionCompilerAST = {
      nodes: [{ id: 'n1', kind: 'DAG_PHASE', label: 'x' }],
      optimizations: [{ id: 'o1', type: 'FOLD_CHECK', target: 't', action: 'a', confidence: 0.9 }],
      loweringRules: [],
    };
    const model = rewriteCausalityModel({ entries: [] }, ast, []);
    const compiled = compileExecutionPhysics(model, ast);
    expect(compiled.rewrittenTimeRules.compilerOptimizationCount).toBe(1);
    expect(compiled.rewrittenCausality.mode).toBeDefined();
    const lines = explainPhysicsInterpretation(model, []);
    expect(lines[0]).toContain('Physics v');
  });
});
