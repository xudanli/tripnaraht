import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionResourceState, ExecutionValue } from './execution-resource.types';

export interface EconomyScoringHints {
  /** Injected aurora upside [0,1] — not derivable from DAG alone. */
  auroraOpportunityScore?: number;
  /** Rough currency proxy multiplier on delay minutes. */
  moneyPerMinute?: number;
}

export function aggregateCostsFromDag(
  dag: ExecutionTruthDAG,
  hints?: EconomyScoringHints,
): ExecutionResourceState {
  const nodes = dag.nodes;
  if (!nodes.length) {
    return {
      timeCost: 1,
      moneyCost: 1,
      energyCost: 1,
      riskCost: 1,
      opportunityCost: 1,
    };
  }

  let delaySum = 0;
  let riskSum = 0;
  let energySum = 0;
  let oppSum = 0;

  for (const n of nodes) {
    delaySum += n.execution.delayMinutes;
    riskSum += n.temporal.arrivalRisk + n.weather.exposureScore * 0.4;
    energySum += n.execution.delayMinutes * 0.02 + n.temporal.crossDayRisk * 0.5;
    oppSum += n.temporal.crossDayRisk * 0.35;
  }

  const n = nodes.length;
  const moneyScale = hints?.moneyPerMinute ?? 1.2;

  return {
    timeCost: delaySum / Math.max(1, n * 180),
    moneyCost: Math.min(1, (delaySum * moneyScale) / Math.max(1, n * 400)),
    energyCost: Math.min(1, energySum / n),
    riskCost: Math.min(1, riskSum / n),
    opportunityCost: Math.min(1, oppSum / n),
  };
}

export function estimateValueFromDag(dag: ExecutionTruthDAG, hints?: EconomyScoringHints): ExecutionValue {
  const nodes = dag.nodes;
  if (!nodes.length) {
    return {
      auroraValue: 0,
      experienceValue: 0,
      stabilityValue: 0,
      completionValue: 0,
    };
  }

  let rel = 0;
  let stable = 0;
  let blocked = 0;

  for (const n of nodes) {
    rel += n.execution.reliabilityScore;
    if (n.execution.finalState === 'OK') {
      stable += 1;
    }
    if (n.execution.finalState === 'BLOCKED') {
      blocked += 1;
    }
  }

  const nd = nodes.length;
  const aurora =
    typeof hints?.auroraOpportunityScore === 'number'
      ? clamp01(hints.auroraOpportunityScore)
      : 0;

  return {
    auroraValue: aurora,
    experienceValue: clamp01(rel / nd),
    stabilityValue: clamp01(stable / nd),
    completionValue: clamp01(1 - blocked / nd),
  };
}

function clamp01(x: number): number {
  if (x < 0) {
    return 0;
  }
  if (x > 1) {
    return 1;
  }
  return x;
}
