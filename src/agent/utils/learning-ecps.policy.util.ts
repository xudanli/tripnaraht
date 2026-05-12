import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type {
  ECPSPolicyState,
  FactorizedExecutionPolicyDistribution,
  FactorizedSampleResult,
  KernelPMF,
  PolicyRNG,
  SampledExecutionSemantic,
  ToolDepthPMF,
  TruncatedGaussianMarginal,
} from '../contracts/execution-learning-policy.types';
import type { ExecutionKernel, ExecutionToolDepth } from '../contracts/execution-semantic-field.types';

const KERNEL_ORDER: ExecutionKernel[] = [
  'REFLEX_KERNEL',
  'LIGHTWEIGHT_KERNEL',
  'REASONING_KERNEL',
  'WORKFLOW_KERNEL',
];

const DEPTH_ORDER: ExecutionToolDepth[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) / 2147483647;
}

/** Serialize freshness + anomalies into fixed low-dimensional hash features (placeholder for learned encoder). */
export function buildPolicyStateFromControlContext(ctx: ExecutionControlContext): ECPSPolicyState {
  const freshnessVector = [
    hashString(JSON.stringify(ctx.freshness ?? {})),
    ctx.replayEligibility === 'FULL' ? 1 : 0,
    ctx.replayEligibility === 'NON_REPLAYABLE' ? 1 : 0,
  ];
  const anomalyVector = ctx.anomalies.slice(0, 8).map((a, i) => {
    const sev = a.severity === 'ERROR' ? 1 : a.severity === 'WARNING' ? 0.5 : 0.2;
    return sev / (i + 1);
  });
  while (anomalyVector.length < 8) anomalyVector.push(0);

  return {
    replayConfidence: ctx.replayConfidence,
    anomalyVector,
    freshnessVector,
    provenanceEmbedding: [],
    routeEmbedding: [],
  };
}

function sumPMF<T extends string>(pmf: Record<T, number>): number {
  let s = 0;
  for (const v of Object.values(pmf) as number[]) s += v;
  return s;
}

export function normalizeKernelPMF(pmf: KernelPMF): KernelPMF {
  const s = sumPMF(pmf);
  if (s <= 0 || !Number.isFinite(s)) {
    const u = 1 / KERNEL_ORDER.length;
    return Object.fromEntries(KERNEL_ORDER.map((k) => [k, u])) as KernelPMF;
  }
  const out = {} as KernelPMF;
  for (const k of KERNEL_ORDER) out[k] = pmf[k] / s;
  return out;
}

export function normalizeToolDepthPMF(pmf: ToolDepthPMF): ToolDepthPMF {
  const s = sumPMF(pmf);
  if (s <= 0 || !Number.isFinite(s)) {
    const u = 1 / DEPTH_ORDER.length;
    return Object.fromEntries(DEPTH_ORDER.map((d) => [d, u])) as ToolDepthPMF;
  }
  const out = {} as ToolDepthPMF;
  for (const d of DEPTH_ORDER) out[d] = pmf[d] / s;
  return out;
}

/** Degenerate π: puts all mass on the realized rule decision (behavior-cloning baseline). */
export function degenerateDistributionFromDecision(
  decision: ExecutionDecision,
): FactorizedExecutionPolicyDistribution {
  const kernel = {} as KernelPMF;
  for (const k of KERNEL_ORDER) kernel[k] = k === decision.kernel ? 1 : 0;

  const toolDepth = {} as ToolDepthPMF;
  for (const d of DEPTH_ORDER) toolDepth[d] = d === decision.toolDepth ? 1 : 0;

  const pin = (x: number): TruncatedGaussianMarginal => ({
    kind: 'truncated_gaussian',
    mean: clamp01(x),
    std: 1e-6,
  });

  return {
    kernel: normalizeKernelPMF(kernel),
    toolDepth: normalizeToolDepthPMF(toolDepth),
    intensity: pin(decision.features.intensity),
    entropy: pin(decision.features.entropy),
    determinism: pin(decision.features.determinism),
  };
}

function sampleCategorical<T extends string>(order: T[], pmf: Record<T, number>, rng: PolicyRNG): T {
  const p = order.map((k) => Math.max(0, pmf[k] ?? 0));
  const s = p.reduce((a, b) => a + b, 0);
  const w = s > 0 ? p.map((x) => x / s) : p.map(() => 1 / order.length);
  let r = rng();
  for (let i = 0; i < order.length; i++) {
    r -= w[i];
    if (r <= 0) return order[i];
  }
  return order[order.length - 1];
}

/** Box-Muller */
function gaussian(rng: PolicyRNG): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleTruncatedGaussian(m: TruncatedGaussianMarginal, rng: PolicyRNG): number {
  const z = m.mean + m.std * gaussian(rng);
  return clamp01(z);
}

/** Single joint sample from factorized π (kernel ⊗ toolDepth ⊗ truncated normals). */
export function sampleFactorizedExecutionPolicy(
  dist: FactorizedExecutionPolicyDistribution,
  rng: PolicyRNG,
): SampledExecutionSemantic {
  const k = normalizeKernelPMF(dist.kernel);
  const td = normalizeToolDepthPMF(dist.toolDepth);
  return {
    kernel: sampleCategorical(KERNEL_ORDER, k, rng),
    toolDepth: sampleCategorical(DEPTH_ORDER, td, rng),
    intensity: sampleTruncatedGaussian(dist.intensity, rng),
    entropy: sampleTruncatedGaussian(dist.entropy, rng),
    determinism: sampleTruncatedGaussian(dist.determinism, rng),
  };
}

export interface MergeSampleOptions {
  /** When true, REUSE decisions stay reflex / NONE regardless of sample (safe replay default). */
  clampReuse?: boolean;
}

/** Apply sampled semantic coords onto an ECPS structural decision (mode / gates / invalidation unchanged). */
export function mergePolicySampleWithDecision(
  ruleDecision: ExecutionDecision,
  sample: SampledExecutionSemantic,
  opts: MergeSampleOptions = {},
): { decision: ExecutionDecision; clampsApplied: string[] } {
  const clampsApplied: string[] = [];
  let kernel = sample.kernel;
  let toolDepth = sample.toolDepth;
  let intensity = sample.intensity;
  let entropy = sample.entropy;
  let determinism = sample.determinism;

  if (opts.clampReuse !== false && ruleDecision.mode === 'REUSE') {
    kernel = 'REFLEX_KERNEL';
    toolDepth = 'NONE';
    intensity = clamp01(Math.min(intensity, 0.25));
    entropy = clamp01(Math.min(entropy, 0.15));
    determinism = clamp01(Math.max(determinism, 0.85));
    clampsApplied.push('REUSE_REFLEX_CLAMP');
  }

  return {
    decision: {
      ...ruleDecision,
      kernel,
      toolDepth,
      features: {
        intensity,
        entropy,
        determinism,
        toolDepth,
      },
    },
    clampsApplied,
  };
}

/** Rule ECPS → degenerate π → optional resample → merged decision (Learning ECPS hook). */
export function sampleExecutionDecisionFromRuleBaseline(
  ruleDecision: ExecutionDecision,
  rng: PolicyRNG,
  opts?: MergeSampleOptions,
): FactorizedSampleResult {
  const dist = degenerateDistributionFromDecision(ruleDecision);
  const sample = sampleFactorizedExecutionPolicy(dist, rng);
  const { decision, clampsApplied } = mergePolicySampleWithDecision(ruleDecision, sample, opts);
  return {
    decision,
    sample,
    meta: {
      policyVersion: 'ecps-rule-baseline/degenerate-v1',
      clampsApplied: clampsApplied.length ? clampsApplied : undefined,
    },
  };
}
