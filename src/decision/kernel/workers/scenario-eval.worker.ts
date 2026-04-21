import { parentPort } from 'worker_threads';
import type { BeliefStateSample } from '../decision-state.types';
import type { ScenarioEvalTask, ScenarioEvalResult } from '../parallel-decision-kernel';
import { edgeRiskBreakdown } from '../environmental-milp-builder';

type WorkerJob = { jobId: string; tasks: ScenarioEvalTask[] };
type WorkerReply = { jobId: string; results: ScenarioEvalResult[] };

function weatherRiskFromSample(sample: BeliefStateSample, fallback: number): number {
  const v = sample.environmentSummary?.weatherRisk;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

parentPort?.on('message', (job: WorkerJob) => {
  const results: ScenarioEvalResult[] = [];
  for (const t of job.tasks ?? []) {
    const sample = t.sample;
    const weatherRisk01 = weatherRiskFromSample(sample, t.envDefaults.weatherRisk01);

    let feasible = true;
    let riskCost = 0;

    for (const e of t.edges) {
      const roadOpen = e.roadOpenOverride01 ?? e.edge.road_open;
      if (roadOpen === 0) {
        feasible = false;
        // keep accumulating risk; caller can penalize infeasible via a separate term later
      }
      const br = edgeRiskBreakdown({ ...e.edge, road_open: roadOpen }, weatherRisk01);
      riskCost += br.total;
    }

    results.push({
      sampleId: String(sample.sampleId),
      weight: typeof sample.weight === 'number' && Number.isFinite(sample.weight) ? sample.weight : 1,
      feasible,
      riskCost,
    });
  }

  const reply: WorkerReply = { jobId: job.jobId, results };
  parentPort?.postMessage(reply);
});

