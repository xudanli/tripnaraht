import type { ConvergenceResult } from '../convergence/convergence.types';
import type { DraftValidationGateResult } from '../gate/draft-validation-gate.types';
import type { ExecutionSimulationReport } from '../execution-simulation/execution-simulation.types';
import type { SlotArbitrationResult } from '../arbitration/slot-arbitration.types';
import type { DraftContractMode } from '../contract/trip-draft-contract.types';
import type {
  DecisionEdge,
  DecisionEdgeCause,
  DecisionNode,
  DecisionTrace,
  DecisionTraceSummary,
} from './decision-trace.types';

function nid(prefix: string, i: number): string {
  return `${prefix}_${i}`;
}

function edge(from: string, to: string, cause: DecisionEdgeCause): DecisionEdge {
  return { from, to, cause };
}

/** 由槽位裁决统计 LLM / ALGO 相对影响（用于 summary 与学习埋点） */
function influenceFromArbitration(arbitration: SlotArbitrationResult | undefined): {
  llmInfluence: number;
  algoInfluence: number;
} {
  if (!arbitration?.slotDecisions?.length) {
    return { llmInfluence: 0.5, algoInfluence: 0.5 };
  }
  let llmW = 0;
  let algoW = 0;
  let hyb = 0;
  for (const d of arbitration.slotDecisions) {
    if (d.decisionSource === 'LLM') llmW += 1;
    else if (d.decisionSource === 'ALGO') algoW += 1;
    else hyb += 1;
  }
  const n = arbitration.slotDecisions.length;
  const hybridSplitLlm = hyb > 0 ? (hyb * 0.5) : 0;
  const hybridSplitAlgo = hyb > 0 ? (hyb * 0.5) : 0;
  const llmTotal = llmW + hybridSplitLlm;
  const algoTotal = algoW + hybridSplitAlgo;
  return {
    llmInfluence: Math.round((llmTotal / n) * 1000) / 1000,
    algoInfluence: Math.round((algoTotal / n) * 1000) / 1000,
  };
}

export interface BuildDecisionTraceParams {
  traceId: string;
  tripId?: string;
  version: number;
  /** 运行时模式 */
  rtMode: 'LLM' | 'ALGO' | 'HYBRID';
  contractMode: DraftContractMode;
  intentSummary: {
    destination: string;
    days: number;
    draftRuntimeMode?: string;
  };
  candidateCount: number;
  solverContextInjected: boolean;
  arbitration?: SlotArbitrationResult;
  convergence?: ConvergenceResult;
  gate?: DraftValidationGateResult;
  simulation: ExecutionSimulationReport;
  dualEngineDivergenceCount: number;
  failureDecisionTraces: Array<{ slot: string; trigger: string; reasonCode: string }>;
  failureReasonCodes: Set<string>;
}

/**
 * 由管线已产生的结构化结果拼装 Decision Trace（嵌入 Orchestrator / DraftRuntime 末尾）。
 */
export function buildDecisionTrace(p: BuildDecisionTraceParams): DecisionTrace {
  const nodes: DecisionNode[] = [];
  const edges: DecisionEdge[] = [];
  let idx = 0;

  const nIntent = nid('INTENT', idx++);
  nodes.push({
    nodeId: nIntent,
    type: 'INTENT',
    input: p.intentSummary,
    output: { contractMode: p.contractMode, rtMode: p.rtMode },
    engine: 'SYSTEM',
  });

  const nCand = nid('CANDIDATE_FILTER', idx++);
  nodes.push({
    nodeId: nCand,
    type: 'CANDIDATE_FILTER',
    input: { destination: p.intentSummary.destination },
    output: { retainedCandidateCount: p.candidateCount },
    engine: 'SYSTEM',
    metrics: { confidence: p.candidateCount >= 20 ? 0.85 : 0.5 },
  });
  edges.push(edge(nIntent, nCand, 'constraint_filter'));

  let lastId = nCand;

  if (p.rtMode === 'HYBRID' && p.arbitration) {
    const nLlm = nid('LLM_SCORE', idx++);
    nodes.push({
      nodeId: nLlm,
      type: 'LLM_SCORE',
      input: { selectionCount: p.arbitration.finalSelections.length },
      output: { slotLevel: 'orchestration_json' },
      engine: 'LLM',
    });
    edges.push(edge(lastId, nLlm, 'pipeline_next'));
    lastId = nLlm;

    const nAlgo = nid('ALGO_SCORE', idx++);
    nodes.push({
      nodeId: nAlgo,
      type: 'ALGO_SCORE',
      input: { engine: 'RouteOptimizationEngine' },
      output: { slotLevel: 'optimized_route' },
      engine: 'ALGO',
    });
    edges.push(edge(lastId, nAlgo, 'score_compare'));

    const nConv = nid('CONVERGENCE', idx++);
    nodes.push({
      nodeId: nConv,
      type: 'CONVERGENCE',
      input: p.convergence
        ? {
            agreementScore: p.convergence.agreementScore,
            divergenceSlots: p.convergence.divergenceAreas.length,
          }
        : {},
      output: p.convergence
        ? {
            winnerStrategy: p.convergence.winnerStrategy,
            convergenceMode: p.convergence.convergenceMode,
          }
        : {},
      engine: 'HYBRID',
      metrics: { score: p.convergence?.agreementScore },
    });
    edges.push(edge(nAlgo, nConv, 'score_compare'));
    lastId = nConv;

    for (const d of p.arbitration.slotDecisions) {
      const nSlot = nid('FINAL_SLOT', idx++);
      nodes.push({
        nodeId: nSlot,
        type: 'FINAL_SLOT',
        day: d.day,
        slot: d.slot,
        input: {
          llmPlaceId: d.llmChoice?.placeId ?? null,
          algoPlaceId: d.algoChoice?.placeId ?? null,
        },
        output: {
          finalPlaceId: d.finalChoice.placeId,
          decisionSource: d.decisionSource,
          reason: d.reason,
          hybridScores: d.hybridScores,
        },
        engine: d.decisionSource === 'HYBRID' ? 'HYBRID' : d.decisionSource,
      });
      edges.push(edge(lastId, nSlot, d.decisionSource === 'ALGO' ? 'engine_override' : 'score_compare'));
      lastId = nSlot;
    }

    if (p.gate) {
      const nGate = nid('GATE', idx++);
      nodes.push({
        nodeId: nGate,
        type: 'GATE',
        input: { dualEngine: true },
        output: {
          status: p.gate.status,
          blockingIssues: p.gate.blockingIssues,
          repairActions: p.gate.repairActions,
        },
        engine: 'SYSTEM',
        metrics: {
          score: p.gate.score.feasibility,
          confidence: p.gate.score.constraintSatisfaction,
        },
      });
      edges.push(edge(lastId, nGate, 'pipeline_next'));
      lastId = nGate;
    }
  } else if (p.rtMode === 'ALGO') {
    const nAlgo = nid('ALGO_SCORE', idx++);
    nodes.push({
      nodeId: nAlgo,
      type: 'ALGO_SCORE',
      input: { fullPlan: true },
      output: { engine: 'RouteOptimizationEngine' },
      engine: 'ALGO',
    });
    edges.push(edge(lastId, nAlgo, 'pipeline_next'));
    lastId = nAlgo;
  } else {
    const nLlm = nid('LLM_SCORE', idx++);
    nodes.push({
      nodeId: nLlm,
      type: 'LLM_SCORE',
      input: { experienceDraft: true },
      output: { engine: 'ExperienceDraftSynthesis' },
      engine: 'LLM',
    });
    edges.push(edge(lastId, nLlm, 'pipeline_next'));
    lastId = nLlm;
  }

  if (p.solverContextInjected) {
    const nSol = nid('SOLVER', idx++);
    nodes.push({
      nodeId: nSol,
      type: 'CONVERGENCE',
      input: { skeleton: true },
      output: { note: 'solver_constraints_injected' },
      engine: 'SOLVER',
      metrics: { score: 0.2 },
    });
    edges.push(edge(lastId, nSol, 'constraint_filter'));
    lastId = nSol;
  }

  const nSim = nid('SIMULATION', idx++);
  nodes.push({
    nodeId: nSim,
    type: 'SIMULATION',
    input: { layers: ['time', 'geo', 'fatigue', 'volatility'] },
    output: {
      feasibilityScore: p.simulation.feasibilityScore,
      riskScore: p.simulation.riskScore,
      recommendation: p.simulation.recommendation,
      issueCount: p.simulation.issues.length,
    },
    engine: 'SYSTEM',
    metrics: { score: p.simulation.feasibilityScore, confidence: 1 - p.simulation.riskScore },
  });
  edges.push(edge(lastId, nSim, 'pipeline_next'));
  lastId = nSim;

  const repairCount = p.failureDecisionTraces.length + p.failureReasonCodes.size;
  if (repairCount > 0) {
    const nRep = nid('REPAIR', idx++);
    nodes.push({
      nodeId: nRep,
      type: 'REPAIR',
      input: { traces: p.failureDecisionTraces.slice(0, 10), reasonCodes: [...p.failureReasonCodes] },
      output: { repairedSlotsApprox: repairCount },
      engine: 'SYSTEM',
    });
    edges.push(edge(lastId, nRep, p.simulation.recommendation === 'REPAIR_REQUIRED' ? 'simulation_fail' : 'pipeline_next'));
    lastId = nRep;
  }

  const inf = influenceFromArbitration(p.arbitration);
  const solverWeight = p.solverContextInjected ? 0.15 : 0;
  const sumInf = inf.llmInfluence + inf.algoInfluence + solverWeight || 1;

  const summary: DecisionTraceSummary = {
    llmInfluence: Math.round((inf.llmInfluence / sumInf) * 1000) / 1000,
    algoInfluence: Math.round((inf.algoInfluence / sumInf) * 1000) / 1000,
    solverInfluence: Math.round((solverWeight / sumInf) * 1000) / 1000,
    totalConflicts:
      p.dualEngineDivergenceCount + (p.simulation.issues?.filter((i) => i.severity === 'high').length ?? 0),
    repairedCount: repairCount,
  };

  return {
    traceId: p.traceId,
    tripId: p.tripId ?? '',
    version: p.version,
    nodes,
    edges,
    summary,
  };
}
