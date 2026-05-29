import type { BeliefStateSample } from '../decision-state.types';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * 将路段可通行性观测以证据强度融合进粒子 `environmentSummary`（不改变粒子数，仅贝叶斯式线性融合占位）。
 */
export function integratePassabilityIntoBeliefSamples(
  samples: BeliefStateSample[],
  input: { passability01: number; evidenceWeight: number },
): BeliefStateSample[] {
  const w = clamp01(input.evidenceWeight);
  const pObs = clamp01(input.passability01);
  return samples.map(s => {
    const cur = typeof s.environmentSummary?.passability === 'number' ? s.environmentSummary.passability : undefined;
    const base = cur ?? 0.78;
    const merged = w * pObs + (1 - w) * base;
    return {
      ...s,
      environmentSummary: { ...s.environmentSummary, passability: merged },
    };
  });
}
