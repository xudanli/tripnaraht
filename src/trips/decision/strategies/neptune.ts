// src/trips/decision/strategies/neptune.ts

/**
 * Neptune — P9 **bytecode VM** + 可选 P10 模拟 + 可选 P11 **静态策略打分** + P12 **模拟前约束证明闸**。
 * 不读取 SemanticView / daylightFeasibility / weatherExecution；策略权重禁止运行时学习。
 * P12 可行性仅由 `buildConstraintProof` → `assertFeasibleBeforeSimulation` 负责；此处 IR CHECK 触发器仍是修补线索，不是前置可行性闸。
 * P13 **Execution Memory**：每次调用写入事件链 + 终止快照（可回放 / 对齐哈希）；Neptune 此处仍执行 VM + 修补，记忆层负责记录而非替代决策逻辑。
 */

import { ActivityCandidate, TripWorldState } from '../world-model';
import { PlanDay, PlanSlot, TripPlan } from '../plan-model';
import type { ExecutionTruthDAG } from '../../execution-truth-dag/execution-truth-dag.types';
import {
  assertOnlyDAGIsDecisionSource,
  assertRepairIRWitnessAligned,
} from '../../execution-truth-dag/dag-canonical-policy';
import type { ExecutionIR } from '../../execution-ir/execution-ir.types';
import type { ExecutionIRRunResult } from '../../execution-ir/execute-execution-ir';
import { assertIRCreatedOnlyByCompiler } from '../../execution-ir/ir-creation-guard';
import type { ExecutionBytecodeProgram } from '../../execution-vm/execution-bytecode.types';
import type { ExecutionTraceEvent } from '../../execution-vm/execution-trace.types';
import { runExecutionIRAsVm } from '../../execution-vm/execution-vm';
import {
  buildSimulationPolicySelection,
  type ExecutionPolicy,
  type SimulationPolicySelection,
} from '../../execution-policy';
import {
  appendExecutionSnapshot,
  buildExecutionSnapshot,
  createExecutionMemoryEventId,
  recordExecutionMemory,
  stableExecutionIrId,
} from '../../execution-memory';
import {
  buildConstraintProof,
  assertFeasibleBeforeSimulation,
  type ExecutionConstraintProof,
} from '../../constraint-proof';
import {
  diffSimulationResults,
  executeSimulation,
  type SimulationDiffReport,
  type ExecutionSimulationRunResult,
  type ExecutionVariant,
} from '../../execution-simulation';
import { routeDecisionContext } from './neptune-decision-router';
import { collectPhysicsFirstTriggers } from './neptune-physics-triggers';
import { formatGuardianHintExplanation } from '../repair/guardian-repair-hints.util';
import { applyGuardianRepairInstructions } from '../repair/guardian-repair-applier.util';
import { assertOverlayIsNonAuthoritative } from '../../execution-overlay/overlay-decision-guard';
import {
  assertDagIsNonDecisionSource,
  isDagObserverOnlyEnabled,
} from '../../execution-truth-dag/dag-observer-lock';
import { buildExecutionProof } from '../../execution-trace-compressor/build-execution-proof';
import { verifyExecutionProof } from '../../execution-verifier/verify-execution-proof';
import type { ExecutionProof } from '../../execution-trace-compressor/execution-proof.types';
import type { ExecutionProofVerificationResult } from '../../execution-verifier/verify-execution-proof';

/** Neptune repair triggers — aligned with DAG-derived execution posture. */
export type NeptuneRepairTriggerCode =
  | 'WEATHER'
  | 'CLOSED'
  | 'TIME_OVER'
  | 'BUDGET_OVER'
  | 'USER_CHANGE'
  | 'RISK_VIOLATION'
  | 'OVERLAY_BLOCKED'
  | 'OVERLAY_HIGH_RISK'
  | 'OVERLAY_RELOCATE'
  | 'OVERLAY_DEGRADED'
  /** P-Next 2 — primary semantics from {@link PhysicsFieldIndex} */
  | 'PHYSICS_IMPASSABLE'
  | 'PHYSICS_DEGRADED_PRESSURE';

export interface RepairTrigger {
  code: NeptuneRepairTriggerCode;
  date?: string;
  slotId?: string;
  details?: Record<string, unknown>;
}

function findSlotInPlan(
  plan: TripPlan,
  slotId: string,
): { slot: PlanSlot; date: string } | undefined {
  for (const day of plan.days) {
    const slot = day.timeSlots.find(s => s.id === slotId);
    if (slot) {
      return { slot, date: day.date };
    }
  }
  return undefined;
}

/**
 * P8-2-B：Neptune 修补触发器 **仅** 由 IR CHECK 步序列索引 witness 节点 —— 禁止并行「按计划槽位全表扫描」。
 */
export function collectNeptuneTriggersFromIR(
  ir: ExecutionIR,
  witness: ExecutionTruthDAG,
  plan: TripPlan,
): RepairTrigger[] {
  const triggers: RepairTrigger[] = [];
  const nodeById = new Map(witness.nodes.map(n => [n.id, n]));

  for (const step of ir.steps) {
    if (step.type !== 'CHECK') {
      continue;
    }
    const node = nodeById.get(step.nodeId);
    if (!node?.slotId) {
      continue;
    }
    const found = findSlotInPlan(plan, node.slotId);
    if (!found) {
      continue;
    }
    triggers.push(...dagViolatesForSlot(found.slot, node.date, witness));
  }

  return triggers;
}

function incidentStructuralStress(dag: ExecutionTruthDAG, nodeId: string): number {
  const kinds = new Set(['TEMPORAL_SEQUENCE', 'CROSS_DAY_SPILL', 'ROUTE_DEPENDENCY']);
  const incident = dag.edges.filter(
    e => kinds.has(e.type) && (e.from === nodeId || e.to === nodeId),
  );
  return incident.length ? Math.max(...incident.map(e => e.weight)) : 0;
}

/**
 * Feasibility: only `node.execution.finalState` + `reliabilityScore`;
 * HARD → relocate vs swap via incident edge stress (traversal scoring).
 */
function dagViolatesForSlot(
  slot: PlanSlot,
  date: string,
  dag: ExecutionTruthDAG,
): RepairTrigger[] {
  const node = dag.nodes.find(n => n.slotId === slot.id);
  if (!node) {
    return [];
  }

  const fs = node.execution.finalState;
  const rel = node.execution.reliabilityScore;

  const baseDetails = {
    dag: true as const,
    source: 'EXECUTION_TRUTH_DAG' as const,
    finalState: fs,
    reliabilityScore: rel,
    delayMinutes: node.execution.delayMinutes,
  };

  if (fs === 'OK') {
    return [];
  }

  if (fs === 'BLOCKED') {
    return [
      {
        code: 'OVERLAY_BLOCKED',
        date,
        slotId: slot.id,
        details: { ...baseDetails, neptunePolicy: 'HARD_RESTRUCTURE' },
      },
    ];
  }

  if (fs === 'HARD') {
    const stress = incidentStructuralStress(dag, node.id);
    const relocate = stress > 18;
    return [
      {
        code: relocate ? 'OVERLAY_RELOCATE' : 'OVERLAY_HIGH_RISK',
        date,
        slotId: slot.id,
        details: {
          ...baseDetails,
          neptunePolicy: relocate ? 'RELOCATE' : 'HIGH_RISK_SWAP',
          incidentEdgeStress: stress,
        },
      },
    ];
  }

  if (fs === 'SOFT') {
    return [
      {
        code: 'OVERLAY_DEGRADED',
        date,
        slotId: slot.id,
        details: { ...baseDetails, neptunePolicy: 'SOFT_ADJUST' },
      },
    ];
  }

  if (fs === 'DEGRADED') {
    const soft = slot.priorityTag === 'optional' || rel < 0.45;
    if (!soft) {
      return [];
    }
    return [
      {
        code: 'OVERLAY_DEGRADED',
        date,
        slotId: slot.id,
        details: { ...baseDetails, neptunePolicy: 'SOFT_ADJUST' },
      },
    ];
  }

  return [];
}

/** Candidate ranking — graph runtime: quality + indoor + title match only (no DEM / riskWeights). */
function pickReplacement(
  _state: TripWorldState,
  _date: string,
  oldSlot: PlanSlot,
  candidates: ActivityCandidate[],
): ActivityCandidate | null {
  const oldTitle = oldSlot.title.toLowerCase();

  const score = (c: ActivityCandidate) => {
    const indoorBonus = c.indoorOutdoor === 'indoor' ? 0.6 : 0;
    const q = c.qualityScore ?? 0.5;
    const matchBonus = (c.name.en || c.name.zh || '')
      .toLowerCase()
      .includes(oldTitle)
      ? 0.2
      : 0;
    return indoorBonus + q + matchBonus;
  };

  const pool = candidates.filter(c => c.location?.point);
  pool.sort((a, b) => score(b) - score(a));

  return pool[0] || null;
}

export interface NeptuneRepairResult {
  plan: TripPlan;
  triggers: RepairTrigger[];
  changedSlotIds: string[];
  explanation: string;
  /** P9：与 bytecode VM 对齐的聚合结果（pathCost / CHECK 失败）。 */
  irVm: ExecutionIRRunResult;
  /** P9：IR 降阶后的机器程序 —— 可序列化重放。 */
  bytecode: ExecutionBytecodeProgram;
  /** P9：逻辑时钟下的确定性执行轨迹。 */
  executionTrace: ExecutionTraceEvent[];
  /** P10/P11：可选 counterfactual 批次 —— heuristic diff + 确定性策略打分选择。 */
  simulation?: {
    runs: ExecutionSimulationRunResult[];
    diff: SimulationDiffReport;
    /** P11：静态 ExecutionPolicy 下的排名 / 选中 variant（无运行时学习）。 */
    policy?: SimulationPolicySelection;
  };
  /** P12：与 simulation 同路径时，模拟前写入的约束证明图（审计 / 回放）。 */
  constraintProof?: ExecutionConstraintProof;
  /** P-Next 2 — routing surface for audit / logs (IR/VM path unchanged). */
  decisionMode?: import('./neptune-decision-router').NeptuneDecisionMode;
  /** P-Next 4：IR CHECK 触发器条数（观测）；未并入 `triggers` 当 `dagObserverOnly`。 */
  observerIrTriggerCount?: number;
  /** P-Next 4：本次运行在 observer collapse 语义下（VM 轨迹仅审计）。 */
  dagObserverOnly?: boolean;
  /** P-Next 5 / P-Next 6：压缩证明；语义层见 `semanticProofLayer` / `TRIP_EXECUTION_SEMANTICS`。 */
  executionProof?: ExecutionProof;
  /** P-Next 5：对 {@link executionProof} 的哈希重算 + 默认不变式套件结果。 */
  invariantCheckResult?: ExecutionProofVerificationResult;
  /** Guardian 辩论指令实际应用的 repair id 列表 */
  guardianAppliedRepairIds?: string[];
}

/** P8-3：Neptune 仅接受显式 **ExecutionIR**（禁止从语义层隐式构造）。 */
export interface NeptuneRepairInput {
  state: TripWorldState;
  plan: TripPlan;
  executionIR: ExecutionIR;
  /** P10：若提供，则在 **同一 witness** 下跑 N 条扰动 IR → bytecode VM，并产出 diff（不改变默认槽位修补逻辑）。 */
  simulationVariants?: ExecutionVariant[];
  /** P11：静态版本化策略 —— 与 simulationVariants 联用时生成确定性 policy 选择与 rank。 */
  executionPolicy?: ExecutionPolicy;
}

/**
 * P9：`runExecutionIRAsVm` 产出审计轨迹；默认仍合并 IR CHECK 修补触发器。
 * P-Next 4：`dagObserverOnly` / `TRIP_DAG_OBSERVER_ONLY` —— 槽位替换仅由 PhysicsFieldIndex（及非 physics-first 时的 overlay fuel）驱动；IR/VM 仅观测。
 *
 * @throws Error `NO_EXECUTION_TRUTH_SOURCE` / `[NEPTUNE] IR required` / witness drift
 */
export function neptuneRepairPlan(input: NeptuneRepairInput): NeptuneRepairResult {
  const { state, plan, executionIR, simulationVariants, executionPolicy } = input;
  const executionTruthDAG = state.signals.executionTruthDAG;
  const ir = executionIR;

  assertOnlyDAGIsDecisionSource(executionTruthDAG, state.policies, 'Neptune.neptuneRepairPlan');
  if (!executionTruthDAG?.nodes?.length) {
    throw new Error('NO_EXECUTION_TRUTH_SOURCE');
  }
  if (!ir?.steps?.length) {
    throw new Error('[NEPTUNE] IR required');
  }
  assertIRCreatedOnlyByCompiler(ir, 'Neptune.neptuneRepairPlan');
  assertRepairIRWitnessAligned(ir, executionTruthDAG, 'Neptune.neptuneRepairPlan');

  const { program, outcome, irRun } = runExecutionIRAsVm(ir, {
    witnessDag: executionTruthDAG,
    mode: 'NORMAL',
  });

  const dagId = ir.meta.dagId;
  const irId = stableExecutionIrId(ir);
  let memTs = Date.now();
  const nextMemTs = () => {
    memTs += 1;
    return memTs;
  };

  recordExecutionMemory({
    id: createExecutionMemoryEventId(dagId, 'IR_COMPILED', memTs),
    dagId,
    irId,
    timestamp: memTs,
    type: 'IR_COMPILED',
    payload: { compiledAt: ir.meta.compiledAt, stepCount: ir.steps.length },
  });

  let simulation: NeptuneRepairResult['simulation'];
  let constraintProof: ExecutionConstraintProof | undefined;
  if (simulationVariants?.length) {
    constraintProof = buildConstraintProof(executionTruthDAG);
    assertFeasibleBeforeSimulation(constraintProof);
    const proofTs = nextMemTs();
    recordExecutionMemory({
      id: createExecutionMemoryEventId(dagId, 'PROOF_EVALUATED', proofTs),
      dagId,
      irId,
      timestamp: proofTs,
      type: 'PROOF_EVALUATED',
      payload: {
        globalStatus: constraintProof.globalStatus,
        proofDagId: constraintProof.dagId,
      },
    });
    const runs = executeSimulation(
      { baseIR: ir, variants: simulationVariants },
      { witnessDag: executionTruthDAG, mode: 'SIMULATION' },
    );
    const diff = diffSimulationResults(runs);
    const policy =
      executionPolicy != null
        ? buildSimulationPolicySelection(runs, executionPolicy, executionTruthDAG)
        : undefined;
    simulation = {
      runs,
      diff,
      ...(policy ? { policy } : {}),
    };
    const simTs = nextMemTs();
    recordExecutionMemory({
      id: createExecutionMemoryEventId(dagId, 'SIMULATION_RUN', simTs),
      dagId,
      irId,
      timestamp: simTs,
      type: 'SIMULATION_RUN',
      payload: {
        variantIds: simulationVariants.map(v => v.id),
        bestVariantId: diff.bestVariantId,
        regretByVariantId: diff.regretByVariantId,
        policySelectedId: policy?.selectedVariantId,
        policyScore: policy?.selectedPolicyScore,
      },
    });
  }

  const decisionMode = routeDecisionContext({
    physicsFieldIndex: state.signals.physicsFieldIndex ?? null,
    executionOverlayFrames: state.signals.executionOverlayFrames ?? null,
    executionTruthDAG,
  });

  if (decisionMode === 'PHYSICS_FIRST') {
    assertOverlayIsNonAuthoritative({
      executionOverlayFramesUsedForDecision: state.policies?.executionOverlayFramesUsedForDecision === true,
    });
  }

  const observeOnlyVm = isDagObserverOnlyEnabled(state.policies);
  if (observeOnlyVm) {
    assertDagIsNonDecisionSource({
      dagUsedForDecision: state.policies?.dagUsedForDecision === true,
    });
  }

  const irTriggers = collectNeptuneTriggersFromIR(ir, executionTruthDAG, plan);

  const fuelTriggers: RepairTrigger[] = [];
  if (decisionMode !== 'PHYSICS_FIRST') {
    for (const frame of state.signals.executionOverlayFrames ?? []) {
      const fuel = frame.fuel;
      if (fuel && fuel.severity === 'CRITICAL' && fuel.safeBeforeNextFuel === false) {
        fuelTriggers.push({
          code: 'OVERLAY_BLOCKED',
          slotId: frame.legId,
          details: {
            domain: 'FUEL',
            fuelSeverity: fuel.severity,
            recommendedStopPoiId: fuel.recommendedStopPoiId,
          },
        });
      }
    }
  }

  const physicsTriggers =
    decisionMode === 'PHYSICS_FIRST' && state.signals.physicsFieldIndex
      ? (collectPhysicsFirstTriggers(state.signals.physicsFieldIndex, plan) as RepairTrigger[])
      : [];

  const triggers: RepairTrigger[] = observeOnlyVm
    ? [...physicsTriggers, ...(decisionMode !== 'PHYSICS_FIRST' ? fuelTriggers : [])]
    : [...irTriggers, ...fuelTriggers, ...physicsTriggers];
  const changedSlotIds: string[] = [];

  const newDays: PlanDay[] = plan.days.map(day => {
    const candidates = state.candidatesByDate[day.date] || [];

    const newSlots = day.timeSlots.map(slot => {
      if (slot.locked || slot.priorityTag === 'anchor') {
        return slot;
      }

      const v = triggers.filter(
        t => t.slotId === slot.id && t.date === day.date,
      );
      if (v.length === 0) {
        return slot;
      }

      const rep = pickReplacement(state, day.date, slot, candidates);
      if (!rep) {
        changedSlotIds.push(slot.id);
        return {
          ...slot,
          title: '自由活动 / 休息',
          type: 'rest' as const,
          poiId: undefined,
          coordinates: undefined,
          reasons: [
            ...(slot.reasons || []),
            'Repaired by Neptune: no feasible replacement, fallback to rest',
          ],
        };
      }

      changedSlotIds.push(slot.id);
      return {
        ...slot,
        title: rep.name.zh || rep.name.en || slot.title,
        type: rep.type,
        poiId: rep.id,
        coordinates: rep.location?.point,
        reasons: [...(slot.reasons || []), 'Repaired by Neptune: swapped due to violation'],
      };
    });

    return { ...day, timeSlots: newSlots };
  });

  let repaired: TripPlan = { ...plan, days: newDays };

  const guardianApply = applyGuardianRepairInstructions(
    repaired,
    state,
    state.signals.repairEvaluation?.repairs,
  );
  repaired = guardianApply.plan;
  for (const slotId of guardianApply.changedSlotIds) {
    if (!changedSlotIds.includes(slotId)) {
      changedSlotIds.push(slotId);
    }
  }

  const simNote =
    simulation?.diff.bestVariantId != null
      ? ` simBest=${simulation.diff.bestVariantId} regretMin=${Math.min(
          ...Object.values(simulation.diff.regretByVariantId),
        ).toFixed(2)}`
      : '';

  const policyNote =
    simulation?.policy != null
      ? ` policyPick=${simulation.policy.selectedVariantId} policyScore=${simulation.policy.selectedPolicyScore.toFixed(3)}`
      : '';

  const modeNote = ` decisionMode=${decisionMode}`;
  const observerNote = observeOnlyVm
    ? ` observerVm=1 irTriggersLogged=${irTriggers.length}`
    : '';
  const guardianNote = formatGuardianHintExplanation(state.signals.guardianRepairHints);
  const guardianAppliedNote =
    guardianApply.appliedRepairIds.length > 0
      ? ` guardianApplied=${guardianApply.appliedRepairIds.length}`
      : '';
  const explanation = (triggers.length
    ? `Neptune (P9 VM).${modeNote}${observerNote} Violations=${triggers.length}, changedSlots=${changedSlotIds.length}, pathCost=${irRun.pathCost.toFixed(1)}, irOk=${irRun.ok}, traceSteps=${outcome.trace.length}${simNote}${policyNote}`
    : `No repair needed.${modeNote}${observerNote} (pathCost=${irRun.pathCost.toFixed(1)}, traceSteps=${outcome.trace.length})${simNote}${policyNote}`) +
    guardianAppliedNote +
    (guardianNote ? ` | ${guardianNote}` : '');

  if (changedSlotIds.length > 0) {
    const repairTs = nextMemTs();
    recordExecutionMemory({
      id: createExecutionMemoryEventId(dagId, 'REPAIR_APPLIED', repairTs),
      dagId,
      irId,
      timestamp: repairTs,
      type: 'REPAIR_APPLIED',
      payload: { changedSlotIds },
    });
  }

  const decisionTs = nextMemTs();
  recordExecutionMemory({
    id: createExecutionMemoryEventId(dagId, 'NEPTUNE_DECISION', decisionTs),
    dagId,
    irId,
    timestamp: decisionTs,
    type: 'NEPTUNE_DECISION',
    payload: {
      explanation,
      triggerCount: triggers.length,
      changedSlotIds,
      irOk: irRun.ok,
      pathCost: irRun.pathCost,
      traceSteps: outcome.trace.length,
    },
  });

  appendExecutionSnapshot(
    buildExecutionSnapshot({
      dag: executionTruthDAG,
      ir,
      overlay: state.signals.executionOverlayFrames,
      proof: constraintProof,
    }),
  );

  const shouldEmitExecutionProof =
    state.policies?.emitExecutionProof === true ||
    (typeof process !== 'undefined' && process.env?.TRIP_EXECUTION_PROOF === '1');

  let executionProof: ExecutionProof | undefined;
  let invariantCheckResult: ExecutionProofVerificationResult | undefined;
  if (shouldEmitExecutionProof) {
    const attachSemanticLayer =
      state.policies?.semanticProofLayer === true ||
      (typeof process !== 'undefined' && process.env?.TRIP_EXECUTION_SEMANTICS === '1');

    executionProof = buildExecutionProof({
      physicsFieldIndex: state.signals.physicsFieldIndex ?? null,
      executionOverlayFrames: state.signals.executionOverlayFrames ?? null,
      executionTruthDAG,
      executionIR: ir,
      irVmRun: { pathCost: irRun.pathCost, ok: irRun.ok },
      executionTrace: outcome.trace,
      triggers,
      changedSlotIds,
      attachSemanticLayer,
    });
    invariantCheckResult = verifyExecutionProof(executionProof);
  }

  return {
    plan: repaired,
    triggers,
    changedSlotIds,
    irVm: irRun,
    bytecode: program,
    executionTrace: outcome.trace,
    ...(constraintProof ? { constraintProof } : {}),
    ...(simulation ? { simulation } : {}),
    explanation,
    decisionMode,
    ...(observeOnlyVm
      ? { observerIrTriggerCount: irTriggers.length, dagObserverOnly: true }
      : {}),
    ...(executionProof && invariantCheckResult
      ? { executionProof, invariantCheckResult }
      : {}),
    ...(guardianApply.appliedRepairIds.length
      ? { guardianAppliedRepairIds: guardianApply.appliedRepairIds }
      : {}),
  };
}

export { routeDecisionContext } from './neptune-decision-router';
export type { NeptuneDecisionMode } from './neptune-decision-router';
