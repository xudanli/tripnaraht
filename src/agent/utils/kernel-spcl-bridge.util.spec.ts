import { learningKernelConstraintsFromSpclError, learningKernelFitWithSpclBridge } from './kernel-spcl-bridge.util';

describe('kernel-spcl-bridge.util', () => {
  it('tightens constraints under high ε', () => {
    const loose = learningKernelConstraintsFromSpclError({
      epsilonByAgent: { a: 0.01 },
      l2Norm: 0.05,
      maxAbsEpsilon: 0.02,
    });
    const tight = learningKernelConstraintsFromSpclError({
      epsilonByAgent: { a: 1 },
      l2Norm: 0.5,
      maxAbsEpsilon: 0.9,
    });
    expect((tight.maxEdgeWeight ?? 1) < (loose.maxEdgeWeight ?? 1)).toBe(true);
  });

  it('learningKernelFitWithSpclBridge delegates to stub', () => {
    const r = learningKernelFitWithSpclBridge({
      priorKernel: {
        agentOrder: ['a'],
        matrix: [[0]],
      },
      ctx: { phiHistory: [] },
      spclBundle: {
        epsilonByAgent: { x: 0.5 },
        l2Norm: 0.4,
        maxAbsEpsilon: 0.5,
      },
    });
    expect(r.kernel.agentOrder).toEqual(['a']);
  });
});
