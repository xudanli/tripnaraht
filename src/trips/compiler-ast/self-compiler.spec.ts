import type { ExecutionSelfModel } from '../self-model/execution-self-model.types';
import { buildSelfCompilerRegistry, explainCompilerRegistry } from '../compiler-registry';
import { generateSelfCompiler } from './generate-self-compiler';

describe('P19 self-compiler', () => {
  const selfModel: ExecutionSelfModel = {
    version: '18',
    observedFailures: [],
    divergencePatterns: [],
    strategyWeights: {},
    compilerDriftSignals: [
      { id: 'cd1', kind: 'CHECK_DENSITY', magnitude: 0.4 },
    ],
  };

  it('generateSelfCompiler emits optimizations and lowering rules', () => {
    const history = Array.from({ length: 12 }, () => ({
      vmOk: true,
      checkFailureCount: 0.05,
      recurringSubgraphCollapses: true,
    }));
    const ast = generateSelfCompiler(history, selfModel);
    expect(ast.nodes.length).toBeGreaterThan(0);
    expect(ast.optimizations.some(o => o.type === 'FOLD_CHECK')).toBe(true);
    expect(ast.loweringRules.length).toBeGreaterThan(0);
  });

  it('buildSelfCompilerRegistry clones phase views', () => {
    const history = Array.from({ length: 10 }, () => ({
      vmOk: true,
      checkFailureCount: 0.02,
    }));
    const ast = generateSelfCompiler(history, selfModel);
    const reg = buildSelfCompilerRegistry(ast, '19.0.0');
    expect(reg.compilers.dagCompiler).not.toBe(reg.compilers.irLoweringCompiler);
    const expl = explainCompilerRegistry(reg);
    expect(expl.some(l => l.includes('FOLD_CHECK') || l.includes('optimization'))).toBe(true);
  });
});
