import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import { buildExecutionProgram } from '../execution-program/build-execution-program';
import type { ExecutionAgent, ExecutionAgentStrategy, ExecutionCandidate } from './agent.types';
import { computeDagScoreFeatures } from './score-from-dag';

function biasScores(
  strategy: ExecutionAgentStrategy,
  base: ReturnType<typeof computeDagScoreFeatures>,
  agentWeight: number,
): ExecutionCandidate['score'] {
  let utility = base.utility;
  let risk = base.risk;
  let cost = base.cost;
  let stability = base.stability;

  switch (strategy) {
    case 'SAFETY_FIRST':
      utility *= 0.92;
      risk *= 1.35;
      stability *= 1.15;
      break;
    case 'UTILITY_MAX':
      utility *= 1.12;
      cost *= 0.95;
      break;
    case 'COST_MIN':
      cost *= 1.25;
      utility *= 1.02;
      break;
    case 'EXPERIENCE_MAX':
      utility *= 1.08;
      risk *= 1.08;
      stability *= 0.95;
      break;
    case 'WEATHER_CHASER':
      risk *= 1.2;
      utility *= 1.05;
      break;
    default:
      break;
  }

  const w = agentWeight;
  return {
    utility: clamp01(utility * w),
    risk: clamp01(risk),
    cost: clamp01(cost),
    stability: clamp01(stability),
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

export function evaluateBuiltInCandidate(
  agentId: string,
  strategy: ExecutionAgentStrategy,
  agentWeight: number,
  dag: ExecutionTruthDAG,
  ir: ExecutionIR,
): ExecutionCandidate {
  const raw = computeDagScoreFeatures(dag);
  const score = biasScores(strategy, raw, agentWeight);
  const proposal = buildExecutionProgram(dag);

  return {
    agentId,
    dagId: ir.meta.dagId,
    strategy,
    score,
    proposal,
  };
}

export function createBuiltInExecutionAgent(
  id: string,
  strategy: ExecutionAgentStrategy,
  weight: number,
): ExecutionAgent {
  return {
    id,
    strategy,
    weight,
    evaluate(dag, ir) {
      return evaluateBuiltInCandidate(id, strategy, weight, dag, ir);
    },
  };
}

export function defaultExecutionAgents(): ExecutionAgent[] {
  return [
    createBuiltInExecutionAgent('agent_safety', 'SAFETY_FIRST', 1.15),
    createBuiltInExecutionAgent('agent_utility', 'UTILITY_MAX', 1.1),
    createBuiltInExecutionAgent('agent_cost', 'COST_MIN', 1.05),
    createBuiltInExecutionAgent('agent_experience', 'EXPERIENCE_MAX', 1.08),
    createBuiltInExecutionAgent('agent_weather', 'WEATHER_CHASER', 1.06),
  ];
}
