import type { BeliefStateSample, DecisionState } from '../decision-state.types';

export interface MemoryBeliefPriorInput {
  /**
   * Minimal shape: produced by memory layer.
   * Keep it generic to avoid hard coupling the kernel to memory schema evolution.
   */
  confidence01: number;
  tags?: string[];
  envOverrides?: Record<string, number>;
}

export interface MemoryBeliefPriorOutput {
  beliefSamples: BeliefStateSample[];
  priorAudit: {
    method: 'MEMORY_PRIOR';
    confidence01: number;
    sampleCount: number;
    tags?: string[];
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Adapter: MemoryState → Belief prior (POMDP)
 *
 * This intentionally stays small:
 * - It produces a lightweight particle set with weights driven by memory confidence.
 * - Kernel can merge/override with live research evidence.
 */
export function memoryToBeliefPrior(args: {
  dso: DecisionState;
  memory: MemoryBeliefPriorInput;
  n?: number;
}): MemoryBeliefPriorOutput {
  const n = Math.max(0, Math.min(2000, Math.floor(args.n ?? 40)));
  const c = clamp01(args.memory.confidence01);
  if (n === 0 || c === 0) {
    return {
      beliefSamples: [],
      priorAudit: { method: 'MEMORY_PRIOR', confidence01: c, sampleCount: 0, tags: args.memory.tags },
    };
  }

  // Build a simple 2-mode mixture: a "center" particle and a diffuse tail.
  // Higher confidence => more mass on the center.
  const centerW = 0.35 + 0.6 * c; // [0.35,0.95]
  const tailW = 1 - centerW;

  const envSummaryBase: Record<string, number> = {};
  if (typeof args.dso.environmentState?.weatherRisk === 'number') {
    envSummaryBase.weatherRisk = clamp01(args.dso.environmentState.weatherRisk);
  }
  const env = { ...envSummaryBase, ...(args.memory.envOverrides ?? {}) };

  const samples: BeliefStateSample[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    const isCenter = i === 0;
    const weight = isCenter ? centerW : tailW / (n - 1);
    samples.push({
      sampleId: `m_${now}_${i}`,
      environmentSummary: env,
      weight,
    });
  }
  return {
    beliefSamples: samples,
    priorAudit: { method: 'MEMORY_PRIOR', confidence01: c, sampleCount: samples.length, tags: args.memory.tags },
  };
}

