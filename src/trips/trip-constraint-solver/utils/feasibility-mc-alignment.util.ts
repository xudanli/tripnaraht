/**
 * Monte Carlo ↔ 确定性目标函数方向对齐（首席运筹优化科学家契约）
 */

export interface MonteCarloAlignmentInput {
  feasibilityProbability: number;
  expectedUtility: number;
}

export interface DeterministicAlignmentInput {
  totalUtility: number;
  hardViolationCount?: number;
}

export interface MonteCarloAlignmentReport {
  aligned: boolean;
  session_consistency_score: number;
  dominant_cid: string;
  drift_vector: {
    delta_utility: number;
    delta_feasibility_proxy: number;
  };
  note: string;
}

/** 确定性效用 > 0.5 视为可行代理；MC P(feasible) > 0.5 为概率可行 */
export function assessMonteCarloDeterministicAlignment(
  mc: MonteCarloAlignmentInput,
  det: DeterministicAlignmentInput,
): MonteCarloAlignmentReport {
  const detFeasibleProxy = det.totalUtility > 0.5 && (det.hardViolationCount ?? 0) === 0;
  const mcFeasibleProxy = mc.feasibilityProbability > 0.5;
  const aligned = detFeasibleProxy === mcFeasibleProxy;

  const detFeasibilityProxy = detFeasibleProxy ? 0.75 : 0.25;
  const deltaFeasibility = mc.feasibilityProbability - detFeasibilityProxy;
  const deltaUtility = mc.expectedUtility - det.totalUtility;

  let sessionScore = 95;
  if (!aligned) {
    sessionScore = Math.max(40, 95 - Math.round(Math.abs(deltaFeasibility) * 80 + Math.abs(deltaUtility) * 40));
  } else if (Math.abs(deltaFeasibility) > 0.25 || Math.abs(deltaUtility) > 0.2) {
    sessionScore = Math.max(75, 95 - Math.round(Math.abs(deltaFeasibility) * 40));
  }

  const dominant_cid =
    (det.hardViolationCount ?? 0) > 0
      ? 'HARD_CONSTRAINT'
      : !aligned
        ? 'MC_DET_DIRECTION_MISMATCH'
        : Math.abs(deltaFeasibility) > 0.2
          ? 'FEASIBILITY_PROXY_DRIFT'
          : 'ALIGNED';

  return {
    aligned,
    session_consistency_score: sessionScore,
    dominant_cid,
    drift_vector: {
      delta_utility: deltaUtility,
      delta_feasibility_proxy: deltaFeasibility,
    },
    note: aligned
      ? 'MC P(feasible) 与确定性效用可行代理方向一致'
      : 'MC 与确定性评估可行方向不一致，概率结果不得覆盖 must_handle 门控',
  };
}
