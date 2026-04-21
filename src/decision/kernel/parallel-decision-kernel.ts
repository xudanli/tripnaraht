import { cpus } from 'os';
import { Worker } from 'worker_threads';
import type { BeliefStateSample } from './decision-state.types';
import type { EnvIndexedJson } from './environmental-milp-builder';
import { edgeRiskBreakdown } from './environmental-milp-builder';
import { explainEdgeRisk } from './risk-explanation.engine';
import { DecisionAmbiguityResolver, type AmbiguityReport } from './ambiguity-resolver';
import type { CalibrationSignal } from './flywheel-risk-feedback';

export type ScenarioEdgeEvalInput = {
  /** Edge object as used by edgeRiskBreakdown(). */
  edge: EnvIndexedJson['edges'][number];
  /** Optional override: treat as hard-closed in this scenario. */
  roadOpenOverride01?: 0 | 1;
};

export type ScenarioEvalTask = {
  sample: BeliefStateSample;
  edges: ScenarioEdgeEvalInput[];
  envDefaults: { weatherRisk01: number; windSpeedMs?: number };
};

export type ScenarioEvalResult = {
  sampleId: string;
  weight: number;
  feasible: boolean;
  riskCost: number;
  // keep room for future: slack minutes, time infeasibility penalties, etc.
};

export type StochasticAggregate = {
  n: number;
  expectedRiskCost: number;
  cvarRiskCost: number;
  alpha: number;
  beta: number;
  objective: number; // E + beta*CVaR
  infeasibleWeight: number;
};

export type ReducedSamplesReport = {
  requested: number;
  kept: number;
  buckets: Array<{ name: string; fromQ: number; toQ: number; kept: number; total: number }>;
};

export type FailureDriversReport = {
  alpha: number;
  tailWeight: number;
  tailCount: number;
  topEdges?: Array<{ edgeId: string; contribution: number }>;
  topFactors: Array<{ factor: string; weight: number; count: number }>;
  bullets: string[];
};

export type CandidatePlan = {
  id: string;
  edges: ScenarioEdgeEvalInput[];
};

type WorkerJob = {
  jobId: string;
  tasks: ScenarioEvalTask[];
};

type WorkerReply = {
  jobId: string;
  results: ScenarioEvalResult[];
};

class SimpleWorkerPool {
  private readonly workers: Worker[] = [];
  private nextIdx = 0;
  private readonly inflight = new Map<string, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void }>();

  constructor(
    private readonly workerFile: string,
    private readonly size: number,
  ) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerFile);
      w.on('message', (msg: WorkerReply) => {
        const h = this.inflight.get(msg?.jobId);
        if (!h) return;
        this.inflight.delete(msg.jobId);
        h.resolve(msg);
      });
      w.on('error', (err) => {
        // Fail all inflight jobs routed to this worker (best effort).
        for (const [jobId, h] of [...this.inflight.entries()]) {
          this.inflight.delete(jobId);
          h.reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      this.workers.push(w);
    }
  }

  async run(job: WorkerJob): Promise<WorkerReply> {
    const w = this.workers[this.nextIdx++ % this.workers.length]!;
    return await new Promise<WorkerReply>((resolve, reject) => {
      this.inflight.set(job.jobId, { resolve, reject });
      w.postMessage(job);
    });
  }

  async destroy(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.terminate()));
  }
}

function normalizeWeights(results: ScenarioEvalResult[]): ScenarioEvalResult[] {
  const sum = results.reduce((s, r) => s + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  if (sum <= 0) {
    const w = results.length > 0 ? 1 / results.length : 0;
    return results.map((r) => ({ ...r, weight: w }));
  }
  return results.map((r) => ({ ...r, weight: r.weight / sum }));
}

function quantile(sorted: number[], q01: number): number {
  if (sorted.length === 0) return 0;
  const q = Math.max(0, Math.min(1, q01));
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx]!;
}

function weatherRisk01FromSample(s: BeliefStateSample, fallback: number): number {
  const v = s.environmentSummary?.weatherRisk;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function computeCvar(
  weighted: Array<{ weight: number; value: number }>,
  alpha: number,
): number {
  const a = Math.max(0.0001, Math.min(0.9999, alpha));
  const tail = 1 - a;
  if (weighted.length === 0) return 0;
  const items = weighted
    .map((x) => ({ weight: Math.max(0, x.weight), value: x.value }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.value - a.value); // worst first
  const wsum = items.reduce((s, x) => s + x.weight, 0);
  if (wsum <= 0) return 0;

  let accW = 0;
  let accV = 0;
  for (const it of items) {
    if (accW >= tail) break;
    const take = Math.min(it.weight, tail - accW);
    accW += take;
    accV += take * it.value;
  }
  return accW > 0 ? accV / accW : items[0]!.value;
}

export class ParallelDecisionKernel {
  private pool?: SimpleWorkerPool;
  private readonly ambiguityResolver = new DecisionAmbiguityResolver();

  constructor(private readonly opts?: { poolSize?: number; workerFile?: string }) {}

  private ensurePool(): SimpleWorkerPool {
    if (this.pool) return this.pool;
    const size = Math.max(1, Math.min(this.opts?.poolSize ?? Math.max(1, cpus().length - 1), 16));
    // Default worker file points to a JS bootstrap that registers ts-node and loads the TS worker.
    // In production (transpiled JS), you can pass an explicit workerFile to avoid ts-node.
    const workerFile =
      this.opts?.workerFile ??
      require.resolve('./workers/scenario-eval.worker.js');
    this.pool = new SimpleWorkerPool(workerFile, size);
    return this.pool;
  }

  /**
   * Evaluate many belief samples in parallel and aggregate risk via E + beta*CVaR_alpha.
   * This is the "industrial" path: fast batch evaluation; does NOT solve a per-scenario MILP.
   */
  async evaluateRiskStochastic(params: {
    samples: BeliefStateSample[];
    edges: ScenarioEdgeEvalInput[];
    envDefaults: { weatherRisk01: number; windSpeedMs?: number };
    alpha: number;
    beta: number;
    batchSize?: number;
    ambiguitySignals?: CalibrationSignal[];
    ambiguityGap01?: number;
  }): Promise<{ aggregate: StochasticAggregate; perScenario: ScenarioEvalResult[]; ambiguity?: AmbiguityReport }> {
    const { samples, edges, envDefaults, alpha, beta } = params;
    const batchSize = Math.max(1, Math.min(params.batchSize ?? 50, 500));
    const pool = this.ensurePool();

    const tasks: ScenarioEvalTask[] = samples.map((s) => ({ sample: s, edges, envDefaults }));
    const jobs: WorkerJob[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      jobs.push({
        jobId: `job-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
        tasks: tasks.slice(i, i + batchSize),
      });
    }

    const replies = await Promise.all(jobs.map((j) => pool.run(j)));
    const perScenarioRaw = replies.flatMap((r) => r.results);
    let perScenario = normalizeWeights(perScenarioRaw);

    // DRO-lite: ambiguity-aware worst-case reweighting
    const ambiguity =
      params.ambiguityGap01 !== undefined
        ? {
            gap01: Math.max(0, Math.min(1, params.ambiguityGap01)),
            isRobustMode: Math.max(0, Math.min(1, params.ambiguityGap01)) > 0.4,
            reason: Math.max(0, Math.min(1, params.ambiguityGap01)) > 0.4 ? '已进入分布鲁棒模式。' : '模型预测在误差范围内。',
          }
        : this.ambiguityResolver.calculateAmbiguity(params.ambiguitySignals as any);

    if (ambiguity.gap01 > 0) {
      const w = this.ambiguityResolver.reweightScenarios(perScenario, ambiguity.gap01);
      perScenario = perScenario.map((r, i) => ({ ...r, weight: w[i] ?? r.weight }));
    }

    const expectedRiskCost = perScenario.reduce((s, r) => s + r.weight * r.riskCost, 0);
    const cvarRiskCost = computeCvar(
      perScenario.map((r) => ({ weight: r.weight, value: r.riskCost })),
      alpha,
    );
    const infeasibleWeight = perScenario.reduce((s, r) => s + (r.feasible ? 0 : r.weight), 0);
    const objective = expectedRiskCost + beta * cvarRiskCost;

    return {
      aggregate: {
        n: perScenario.length,
        expectedRiskCost,
        cvarRiskCost,
        alpha,
        beta,
        objective,
        infeasibleWeight,
      },
      perScenario,
      ambiguity,
    };
  }

  /**
   * SAA-lite: Reduce many samples into a smaller representative set via quantile stratification.
   *
   * Buckets: [0,0.25], (0.25,0.75], (0.75,0.95], (0.95,1.0]
   * Always keeps some extreme tail samples to preserve CVaR fidelity.
   */
  reduceSamplesByWeatherQuantiles(params: {
    samples: BeliefStateSample[];
    envWeatherRiskFallback01: number;
    targetN: number;
    bucketRatios?: { q0_25?: number; q25_75?: number; q75_95?: number; q95_100?: number };
  }): { samples: BeliefStateSample[]; report: ReducedSamplesReport } {
    const targetN = Math.max(1, Math.min(params.targetN, params.samples.length));
    const ratios = {
      q0_25: params.bucketRatios?.q0_25 ?? 0.25,
      q25_75: params.bucketRatios?.q25_75 ?? 0.45,
      q75_95: params.bucketRatios?.q75_95 ?? 0.2,
      q95_100: params.bucketRatios?.q95_100 ?? 0.1,
    };

    const scored = params.samples.map((s) => ({
      s,
      r: weatherRisk01FromSample(s, params.envWeatherRiskFallback01),
      w: typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight : 1,
    }));
    const sortedR = [...scored.map((x) => x.r)].sort((a, b) => a - b);
    const q25 = quantile(sortedR, 0.25);
    const q75 = quantile(sortedR, 0.75);
    const q95 = quantile(sortedR, 0.95);

    const buckets = [
      { name: 'q0_25', fromQ: 0, toQ: 0.25, items: scored.filter((x) => x.r <= q25) },
      { name: 'q25_75', fromQ: 0.25, toQ: 0.75, items: scored.filter((x) => x.r > q25 && x.r <= q75) },
      { name: 'q75_95', fromQ: 0.75, toQ: 0.95, items: scored.filter((x) => x.r > q75 && x.r <= q95) },
      { name: 'q95_100', fromQ: 0.95, toQ: 1, items: scored.filter((x) => x.r > q95) },
    ];

    const pickFrom = (items: typeof scored, n: number): BeliefStateSample[] => {
      if (n <= 0 || items.length === 0) return [];
      // weight-prioritized deterministic pick (stable-ish, good for tests and repeatability)
      const sorted = [...items].sort((a, b) => (b.w - a.w) || (b.r - a.r) || String(a.s.sampleId).localeCompare(String(b.s.sampleId)));
      return sorted.slice(0, Math.min(n, sorted.length)).map((x) => x.s);
    };

    const n0 = Math.round(targetN * ratios.q0_25);
    const n1 = Math.round(targetN * ratios.q25_75);
    const n2 = Math.round(targetN * ratios.q75_95);
    let n3 = targetN - n0 - n1 - n2;
    if (n3 < 1) n3 = Math.min(1, targetN); // always keep some tail

    const picked = [
      ...pickFrom(buckets[0]!.items, n0),
      ...pickFrom(buckets[1]!.items, n1),
      ...pickFrom(buckets[2]!.items, n2),
      ...pickFrom(buckets[3]!.items, n3),
    ];

    // De-dupe by sampleId, then trim to targetN
    const seen = new Set<string>();
    const uniq = picked.filter((s) => {
      const id = String(s.sampleId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const reduced = uniq.slice(0, targetN);

    return {
      samples: reduced,
      report: {
        requested: params.samples.length,
        kept: reduced.length,
        buckets: buckets.map((b) => ({
          name: b.name,
          fromQ: b.fromQ,
          toQ: b.toQ,
          kept: reduced.filter((s) => {
            const r = weatherRisk01FromSample(s, params.envWeatherRiskFallback01);
            if (b.name === 'q0_25') return r <= q25;
            if (b.name === 'q25_75') return r > q25 && r <= q75;
            if (b.name === 'q75_95') return r > q75 && r <= q95;
            return r > q95;
          }).length,
          total: b.items.length,
        })),
      },
    };
  }

  /**
   * K-candidate × N-scenario compare. Each candidate is expressed as an edge list.
   */
  async compareCandidates(params: {
    candidates: CandidatePlan[];
    samples: BeliefStateSample[];
    envDefaults: { weatherRisk01: number; windSpeedMs?: number };
    alpha: number;
    beta: number;
    batchSize?: number;
  }): Promise<
    Array<{
      planId: string;
      expectedRiskCost: number;
      cvarRiskCost: number;
      objective: number;
      robustness: number; // 1 - infeasibleWeight
      infeasibleWeight: number;
    }>
  > {
    const rows = await Promise.all(
      params.candidates.map(async (c) => {
        const r = await this.evaluateRiskStochastic({
          samples: params.samples,
          edges: c.edges,
          envDefaults: params.envDefaults,
          alpha: params.alpha,
          beta: params.beta,
          batchSize: params.batchSize,
        });
        return {
          planId: c.id,
          expectedRiskCost: r.aggregate.expectedRiskCost,
          cvarRiskCost: r.aggregate.cvarRiskCost,
          objective: r.aggregate.objective,
          infeasibleWeight: r.aggregate.infeasibleWeight,
          robustness: Math.max(0, 1 - r.aggregate.infeasibleWeight),
        };
      }),
    );
    return rows.sort((a, b) => a.objective - b.objective);
  }

  /**
   * CVaR diagnosis: aggregate drivers from the worst (1-alpha) tail scenarios.
   * Recomputes per-edge breakdowns on main thread for tail only (small set).
   */
  identifyFailureDrivers(params: {
    perScenario: ScenarioEvalResult[];
    samples: BeliefStateSample[];
    edges: ScenarioEdgeEvalInput[];
    envDefaults: { weatherRisk01: number; windSpeedMs?: number };
    alpha: number;
    topK?: number;
    topMEdges?: number;
  }): FailureDriversReport {
    const alpha = Math.max(0.0001, Math.min(0.9999, params.alpha));
    const tail = 1 - alpha;
    const topK = Math.max(1, Math.min(params.topK ?? 6, 20));

    const sampleById = new Map(params.samples.map((s) => [String(s.sampleId), s] as const));
    const sorted = [...params.perScenario].sort((a, b) => b.riskCost - a.riskCost); // worst first

    let accW = 0;
    const tailScenarios: ScenarioEvalResult[] = [];
    for (const r of sorted) {
      if (accW >= tail) break;
      tailScenarios.push(r);
      accW += Math.max(0, r.weight);
    }

    // 1) Sensitivity: compute edge contribution in the tail.
    const edgeContribution = new Map<string, number>();
    const edgeById = new Map<string, ScenarioEdgeEvalInput>();
    for (const e of params.edges) {
      const id = String((e.edge as any).id ?? `${e.edge.from}__${e.edge.to}`);
      edgeById.set(id, e);
    }

    const factorStats = new Map<string, { weight: number; count: number }>();
    const bulletCounts = new Map<string, number>();

    for (const sc of tailScenarios) {
      const sample = sampleById.get(String(sc.sampleId));
      const weatherRisk01 = sample ? weatherRisk01FromSample(sample, params.envDefaults.weatherRisk01) : params.envDefaults.weatherRisk01;
      const windSpeedMs = (sample?.environmentSummary as any)?.windSpeedMs ?? params.envDefaults.windSpeedMs;

      // compute per-edge risk in tail (no explanation yet)
      for (const e of params.edges) {
        const edgeId = String((e.edge as any).id ?? `${e.edge.from}__${e.edge.to}`);
        const roadOpen = e.roadOpenOverride01 ?? e.edge.road_open;
        const br = edgeRiskBreakdown({ ...e.edge, road_open: roadOpen }, weatherRisk01);
        edgeContribution.set(edgeId, (edgeContribution.get(edgeId) ?? 0) + sc.weight * br.total);
      }

      // defer explanation until Top-M edges are selected
      void windSpeedMs;
    }

    const topM = Math.max(1, Math.min(params.topMEdges ?? 8, params.edges.length || 1));
    const topEdges = [...edgeContribution.entries()]
      .map(([edgeId, contribution]) => ({ edgeId, contribution }))
      .sort((a, b) => (b.contribution - a.contribution) || a.edgeId.localeCompare(b.edgeId))
      .slice(0, topM);

    // 2) Explanation only for Top-M edges (cheaper + more focused).
    for (const sc of tailScenarios) {
      const sample = sampleById.get(String(sc.sampleId));
      const weatherRisk01 = sample ? weatherRisk01FromSample(sample, params.envDefaults.weatherRisk01) : params.envDefaults.weatherRisk01;
      const windSpeedMs = (sample?.environmentSummary as any)?.windSpeedMs ?? params.envDefaults.windSpeedMs;

      for (const te of topEdges) {
        const e = edgeById.get(te.edgeId);
        if (!e) continue;
        const roadOpen = e.roadOpenOverride01 ?? e.edge.road_open;
        const br = edgeRiskBreakdown({ ...e.edge, road_open: roadOpen }, weatherRisk01);
        const exp = explainEdgeRisk({
          breakdown: br,
          edge: { ...e.edge, road_open: roadOpen },
          env: { windSpeedMs, weatherRisk01 },
        });

        for (const f of exp.primaryFactors) {
          const prev = factorStats.get(f) ?? { weight: 0, count: 0 };
          factorStats.set(f, { weight: prev.weight + sc.weight, count: prev.count + 1 });
        }
        for (const b of exp.bullets) {
          bulletCounts.set(b, (bulletCounts.get(b) ?? 0) + 1);
        }
      }
    }

    const topFactors = [...factorStats.entries()]
      .map(([factor, v]) => ({ factor, weight: v.weight, count: v.count }))
      .sort((a, b) => (b.weight - a.weight) || (b.count - a.count) || a.factor.localeCompare(b.factor))
      .slice(0, topK);

    const bullets = [...bulletCounts.entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([b]) => b);

    return {
      alpha,
      tailWeight: accW,
      tailCount: tailScenarios.length,
      topEdges,
      topFactors,
      bullets,
    };
  }

  /**
   * Micro-benchmark helper (for local profiling).
   * Returns p50/p95 in ms. Not used in unit tests.
   */
  async measureEvaluateRiskLatency(params: {
    samples: BeliefStateSample[];
    edges: ScenarioEdgeEvalInput[];
    envDefaults: { weatherRisk01: number; windSpeedMs?: number };
    alpha: number;
    beta: number;
    batchSize?: number;
    iterations: number;
    warmup?: number;
  }): Promise<{ p50ms: number; p95ms: number; runs: number }> {
    const warmup = Math.max(0, params.warmup ?? 1);
    const iters = Math.max(1, params.iterations);
    const times: number[] = [];

    for (let i = 0; i < warmup + iters; i++) {
      const t0 = process.hrtime.bigint();
      await this.evaluateRiskStochastic({
        samples: params.samples,
        edges: params.edges,
        envDefaults: params.envDefaults,
        alpha: params.alpha,
        beta: params.beta,
        batchSize: params.batchSize,
      });
      const t1 = process.hrtime.bigint();
      const ms = Number(t1 - t0) / 1e6;
      if (i >= warmup) times.push(ms);
    }

    times.sort((a, b) => a - b);
    const p = (q: number) => times[Math.min(times.length - 1, Math.floor(q * (times.length - 1)))] ?? 0;
    return { p50ms: p(0.5), p95ms: p(0.95), runs: times.length };
  }

  async close(): Promise<void> {
    await this.pool?.destroy();
    this.pool = undefined;
  }
}

