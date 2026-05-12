/**
 * Bridge SPCL error field → causal kernel learning constraints (Kθ calibration hooks).
 */

import type {
  CausalInteractionKernel,
  LearningKernelFitConstraints,
  LearningKernelFitResult,
} from '../contracts/multi-agent-causal-field.types';
import type { LearnedKernelContext } from '../contracts/neural-causal-graph-execution.types';
import type { SpclErrorBundle } from '../contracts/shadow-policy-calibration.types';
import { learningKernelFitStub } from './multi-agent-causal-field.util';

/** Map ε geometry to priors on edge weights / sparsity — tighter when shadow aligns (low error). */
export function learningKernelConstraintsFromSpclError(bundle: SpclErrorBundle): LearningKernelFitConstraints {
  const high = bundle.l2Norm > 0.28 || bundle.maxAbsEpsilon > 0.45;
  return {
    maxEdgeWeight: high ? 0.82 : 1,
    sparsityPrior: high ? 0.06 : 0.015,
  };
}

/** Single call-site for `learningKernelFitStub` once SPCL critic is available. */
export function learningKernelFitWithSpclBridge(params: {
  priorKernel: CausalInteractionKernel;
  ctx: LearnedKernelContext;
  spclBundle: SpclErrorBundle | null;
}): LearningKernelFitResult {
  const constraints = params.spclBundle
    ? learningKernelConstraintsFromSpclError(params.spclBundle)
    : undefined;
  void params.ctx;
  return learningKernelFitStub({
    priorKernel: params.priorKernel,
    constraints,
  });
}
