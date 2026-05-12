/**
 * 从 **SimulationRunResult + 可选 witness DAG** 抽取确定性标量特征 —— 无随机，无学习。
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionSimulationRunResult } from '../execution-simulation/execution-simulation.types';

export interface PolicyScoreFeatures {
  /** 0–1，越高越偏好（由 VM CHECK 失败惩罚推导）。 */
  reliabilityProxy: number;
  /** bytecode VM 聚合路径代价。 */
  costLoad: number;
  /** 扰动 + witness 暮光压力合成 proxy（全 deterministic）。 */
  daylightRiskProxy: number;
  /** 扰动道路噪声 proxy。 */
  roadRiskProxy: number;
  /** witness 中跨日 spill 边权重归一化和。 */
  crossDayStressProxy: number;
}

export function extractPolicyFeatures(
  run: ExecutionSimulationRunResult,
  witness?: ExecutionTruthDAG,
): PolicyScoreFeatures {
  const failN = run.irRun.failures.length;
  const reliabilityProxy = failN === 0 ? 1 : Math.max(0, 1 - 0.35 * failN);

  const costLoad = run.irRun.pathCost;

  const p = run.variant.perturbation;
  const shiftDaylight =
    witness?.nodes?.some(n => n.temporal.daylightViolation) === true ? 0.35 : 0;
  const daylightRiskProxy = shiftDaylight + (p.weatherShift ?? 0);

  const roadRiskProxy = p.roadNoise ?? 0;

  let crossDayStressProxy = 0;
  if (witness?.edges?.length) {
    const spill = witness.edges
      .filter(e => e.type === 'CROSS_DAY_SPILL')
      .reduce((s, e) => s + e.weight, 0);
    crossDayStressProxy = spill / witness.edges.length;
  }

  return {
    reliabilityProxy,
    costLoad,
    daylightRiskProxy,
    roadRiskProxy,
    crossDayStressProxy,
  };
}
