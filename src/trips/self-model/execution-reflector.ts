/**
 * Heuristic reflection — produces **proposals only**; promotion requires shadow + drift budget (see self-update-compiler).
 */

import { createHash } from 'crypto';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionSelfModel, SelfUpdateProposal } from './execution-self-model.types';
import type { ReflectableExecutionResult } from './reflect-input.types';

function proposalId(seed: string): string {
  return createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 18);
}

function countTriggers(results: ReflectableExecutionResult[], predicate: (c: string) => boolean): number {
  let n = 0;
  for (const r of results) {
    for (const c of r.neptuneTriggerCodes ?? []) {
      if (predicate(c)) {
        n += 1;
      }
    }
  }
  return n;
}

function totalTriggers(results: ReflectableExecutionResult[]): number {
  let n = 0;
  for (const r of results) {
    n += r.neptuneTriggerCodes?.length ?? 0;
  }
  return n;
}

export function detectDAGBias(
  dag: ExecutionTruthDAG,
  results: ReflectableExecutionResult[],
): SelfUpdateProposal[] {
  const out: SelfUpdateProposal[] = [];
  if (!results.length || !dag.edges.some(e => e.type === 'ROUTE_DEPENDENCY')) {
    return out;
  }

  const vmOkRate = results.filter(r => r.vmOk).length / results.length;
  const highRiskTriggers = countTriggers(results, c => c === 'OVERLAY_HIGH_RISK');
  const trigDenom = Math.max(1, totalTriggers(results));
  const highRiskRate = highRiskTriggers / trigDenom;

  if (highRiskRate > 0.35 && vmOkRate > 0.85) {
    out.push({
      id: proposalId('dag_bias_route'),
      type: 'DAG_WEIGHT_DRIFT',
      target: 'edge:ROUTE_DEPENDENCY',
      proposedDelta: -0.12,
      confidence: 0.72,
      rationale:
        'Neptune HIGH_RISK triggers frequent while VM outcomes mostly OK — damp ROUTE_DEPENDENCY edge influence.',
    });
  }

  return out;
}

export function detectIRInefficiency(ir: ExecutionIR, results: ReflectableExecutionResult[]): SelfUpdateProposal[] {
  const out: SelfUpdateProposal[] = [];
  const projectRisk = ir.steps.filter(s => s.type === 'PROJECT' && s.metric === 'risk').length;
  const checks = ir.steps.filter(s => s.type === 'CHECK').length;
  const earlyCheckFailures = results.filter(
    r => !r.vmOk && r.vmFailures.some(f => f.includes('CHECK')),
  ).length;

  if (checks > 0 && projectRisk > checks * 2 && earlyCheckFailures / Math.max(1, results.length) < 0.2) {
    out.push({
      id: proposalId('ir_project_risk'),
      type: 'IR_STEP_REDUCTION',
      target: 'PROJECT:risk',
      action: 'REMOVE_OR_DELAY',
      confidence: 0.58,
      rationale:
        'Dense PROJECT:risk steps with low early CHECK failure rate — defer or thin risk projections.',
    });
  }

  return out;
}

export function detectRepairOverreach(results: ReflectableExecutionResult[]): SelfUpdateProposal[] {
  const out: SelfUpdateProposal[] = [];
  if (!results.length) {
    return out;
  }

  const relocate = countTriggers(results, c => c === 'OVERLAY_RELOCATE');
  const relocRate = relocate / Math.max(1, totalTriggers(results));
  const vmOkRate = results.filter(r => r.vmOk).length / results.length;

  if (relocRate > 0.25 && vmOkRate > 0.88) {
    out.push({
      id: proposalId('repair_reloc'),
      type: 'REPAIR_THRESHOLD_SHIFT',
      target: 'migrationNormalizedThreshold',
      delta: 0.05,
      confidence: 0.65,
      rationale:
        'Relocate triggers dominate yet VM succeeds — raise migration threshold slightly to reduce overreach.',
    });
  }

  return out;
}

export function rankProposals(proposals: SelfUpdateProposal[]): SelfUpdateProposal[] {
  return [...proposals].sort((a, b) => b.confidence - a.confidence);
}

export function reflectOnExecution(
  dag: ExecutionTruthDAG,
  ir: ExecutionIR,
  results: ReflectableExecutionResult[],
  _selfModel: ExecutionSelfModel,
): SelfUpdateProposal[] {
  const merged: SelfUpdateProposal[] = [
    ...detectDAGBias(dag, results),
    ...detectIRInefficiency(ir, results),
    ...detectRepairOverreach(results),
  ];
  return rankProposals(merged);
}
