/**
 * P15-A：同一 DAG/IR 上并行产生多份 `ExecutionCandidate` + 标量共识。
 * 解释层（Neptune）可消费 `candidates` / `consensus` 做对比说明，不替代本层选举。
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionAgent, MultiAgentExecutionResult } from './agent.types';
import { buildConsensus } from './build-consensus';

export function runMultiAgentExecution(
  dag: ExecutionTruthDAG,
  ir: ExecutionIR,
  agents: ExecutionAgent[],
): MultiAgentExecutionResult {
  const candidates = agents.map(a => a.evaluate(dag, ir));
  const consensus = buildConsensus(candidates);
  return { candidates, consensus };
}
