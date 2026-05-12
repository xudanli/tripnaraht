/**
 * P8-2-B：RepairEvaluator 在 `repairIROnlyLock` 下的唯一入口 —— 仅遍历 Execution IR 的 CHECK/TRAVERSE，
 * 用 ExecutionTruthDAG 作 **witness**（键控查找），禁止并行「槽位全表扫描」启发式。
 */

import type {
  ExecutionNode,
  ExecutionTruthDAG,
} from '../../execution-truth-dag/execution-truth-dag.types';
import { assertRepairIRWitnessAligned } from '../../execution-truth-dag/dag-canonical-policy';
import { buildGraphPatchesFromRepairs } from '../../execution-truth-dag/build-graph-patches';
import type { ExecutionIR } from '../../execution-ir/execution-ir.types';
import { executeExecutionIR } from '../../execution-ir/execute-execution-ir';
import { assertIRCreatedOnlyByCompiler } from '../../execution-ir/ir-creation-guard';
import type { PlanSlot } from '../plan-model';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';
import type { RepairEvaluationResult, RepairInstruction } from './repair-action.types';
import type { RepairEvaluatorInput } from './repair-evaluator.types';
import { collectFuelReachabilityRepairs } from './fuel-reachability-repairs';

const DEFAULT_COMPRESS_CAP = 45;
const DAYLIGHT_SHIFT_HINT_MIN = 25;
const SEQUENCE_PRESSURE_THRESHOLD_MIN = 35;

function microRepairCaps(policies?: RepairEvaluatorInput['policies']) {
  const mr = policies?.microRepair;
  return {
    compressCap: mr?.maxCompressMinutes ?? DEFAULT_COMPRESS_CAP,
    crossDayCap: mr?.crossDayMitigationCapMinutes ?? 30,
    daylightShift: mr?.daylightShiftHintMinutes ?? DAYLIGHT_SHIFT_HINT_MIN,
    seqThreshold:
      mr?.sequencePressureThresholdMinutes ?? SEQUENCE_PRESSURE_THRESHOLD_MIN,
    highTraverseCost: 18,
  };
}

function findSlot(
  plan: RepairEvaluatorInput['plan'],
  slotId: string,
): { date: string; slot: PlanSlot } | undefined {
  for (const day of plan.days) {
    const slot = day.timeSlots.find(s => s.id === slotId);
    if (slot) {
      return { date: day.date, slot };
    }
  }
  return undefined;
}

function dateForSlot(plan: RepairEvaluatorInput['plan'], slotId: string): string | undefined {
  for (const day of plan.days) {
    if (day.timeSlots.some(s => s.id === slotId)) {
      return day.date;
    }
  }
  return undefined;
}

/** Daylight repairs from witness node（overlay 帧不存在 —— 仅用 DAG 节点真相）。 */
function daylightRepairsForWitnessNode(
  node: ExecutionNode,
  plan: RepairEvaluatorInput['plan'],
  caps: ReturnType<typeof microRepairCaps>,
  idOffset: number,
): RepairInstruction[] {
  if (!node.temporal.daylightViolation || !node.slotId) {
    return [];
  }
  const found = findSlot(plan, node.slotId);
  if (!found) {
    return [];
  }
  const { date, slot } = found;
  const out: RepairInstruction[] = [];
  let i = idOffset;

  if (slot.locked) {
    out.push({
      id: `ir_daylight_locked_${node.slotId}_${i++}`,
      action: 'SHORTEN_ACTIVITY',
      targetSlotIds: [node.slotId],
      date,
      narrative: `IR×witness：暮光后仍在途；locked 槽仅建议缩短或改日`,
      suggestedDeltaMinutes: Math.min(caps.compressCap, caps.daylightShift),
      priority: 15,
      confidence: 0.55,
      metadata: { source: 'IR_WITNESS', domain: 'DAYLIGHT', locked: true },
    });
    return out.sort((a, b) => a.priority - b.priority);
  }

  if (slot.priorityTag === 'optional') {
    out.push({
      id: `ir_daylight_skip_${node.slotId}_${i++}`,
      action: 'SKIP_OPTIONAL_POI',
      targetSlotIds: [node.slotId],
      date,
      narrative: `IR×witness：民用暮光后结束「${slot.title}」`,
      priority: 8,
      confidence: 0.72,
      metadata: { source: 'IR_WITNESS', domain: 'DAYLIGHT' },
    });
  }

  out.push({
    id: `ir_daylight_move_${node.slotId}_${i++}`,
    action: 'MOVE_SLOT_EARLIER',
    targetSlotIds: [node.slotId],
    date,
    narrative: `IR×witness：前移「${slot.title}」，回收暮光后风险`,
    suggestedDeltaMinutes: caps.daylightShift,
    priority: 5,
    confidence: 0.68,
    metadata: { source: 'IR_WITNESS', domain: 'DAYLIGHT' },
  });

  if (slot.endTime) {
    out.push({
      id: `ir_daylight_shorten_${node.slotId}_${i++}`,
      action: 'SHORTEN_ACTIVITY',
      targetSlotIds: [node.slotId],
      date,
      narrative: `IR×witness：压缩「${slot.title}」停留至多 ${caps.compressCap}min`,
      suggestedDeltaMinutes: caps.compressCap,
      priority: 7,
      confidence: 0.62,
      metadata: { source: 'IR_WITNESS', domain: 'DAYLIGHT' },
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function pressureRepairsFromIRWitness(
  input: RepairEvaluatorInput,
  witness: ExecutionTruthDAG,
  ir: ExecutionIR,
  caps: ReturnType<typeof microRepairCaps>,
  totalDelayProxy: number,
): RepairInstruction[] {
  if (totalDelayProxy < caps.seqThreshold) {
    return [];
  }

  const checkIds = new Set(
    ir.steps.filter(s => s.type === 'CHECK').map(s => s.nodeId),
  );
  const stressedDates = new Set(
    witness.nodes
      .filter(
        n =>
          checkIds.has(n.id) &&
          (n.execution.finalState === 'DEGRADED' || n.execution.finalState === 'HARD'),
      )
      .map(n => n.date),
  );

  const cap =
    typeof input.policies?.bufferMinBetweenActivities === 'number'
      ? Math.min(caps.compressCap, input.policies.bufferMinBetweenActivities + 30)
      : caps.compressCap;

  const out: RepairInstruction[] = [];
  let k = 0;

  for (const day of input.plan.days) {
    if (!stressedDates.has(day.date)) {
      continue;
    }
    for (const slot of day.timeSlots) {
      if (slot.priorityTag !== 'optional' || slot.locked) {
        continue;
      }
      out.push({
        id: `ir_pressure_compress_${slot.id}_${k++}`,
        action: 'COMPRESS_STOP',
        targetSlotIds: [slot.id],
        date: day.date,
        narrative: `IR×witness：延误代理≈${Math.round(totalDelayProxy)}min（CHECK 节点聚合）：压缩可选「${slot.title}」至多 ${cap}min`,
        suggestedDeltaMinutes: cap,
        priority: 12,
        confidence: 0.58,
        metadata: {
          source: 'IR_WITNESS',
          domain: 'DELAY_PRESSURE',
          aggregateDelayProxy: totalDelayProxy,
        },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function crossDayRepairsFromWitnessNode(
  node: ExecutionNode,
  plan: RepairEvaluatorInput['plan'],
  caps: ReturnType<typeof microRepairCaps>,
  idBase: number,
): RepairInstruction[] {
  if (!node.slotId || node.temporal.crossDayRisk < 0.25) {
    return [];
  }
  const src = findSlot(plan, node.slotId);
  const out: RepairInstruction[] = [];
  let i = idBase;

  if (src && !src.slot.locked) {
    const delta = Math.min(Math.ceil(node.temporal.crossDayRisk * 60), caps.crossDayCap);
    out.push({
      id: `ir_cross_early_${node.slotId}_${i}`,
      action: 'EARLY_DEPARTURE',
      targetSlotIds: [node.slotId],
      date: src.date,
      narrative: `IR×witness：跨日风险 ${(node.temporal.crossDayRisk * 100).toFixed(0)}%：前移「${src.slot.title}」至多 ${delta}min`,
      suggestedDeltaMinutes: Math.max(5, delta),
      priority: 6,
      confidence: 0.65,
      metadata: {
        source: 'IR_WITNESS',
        domain: 'CROSS_DAY',
        crossDayRisk: node.temporal.crossDayRisk,
      },
    });
    i += 1;
  }

  const spillDate = dateForSlot(plan, node.slotId);
  if (!spillDate) {
    return out.sort((a, b) => a.priority - b.priority);
  }
  const targetDay = plan.days.find(day => day.date === spillDate);
  if (!targetDay?.timeSlots?.length) {
    return out.sort((a, b) => a.priority - b.priority);
  }
  const sorted = [...targetDay.timeSlots].sort(
    (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
  );
  const head = sorted.find(s => !s.locked);
  if (head && head.id !== node.slotId) {
    out.push({
      id: `ir_cross_head_${spillDate}_${i}`,
      action: 'MOVE_SLOT_EARLIER',
      targetSlotIds: [head.id],
      date: spillDate,
      narrative: `IR×witness：次日首段「${head.title}」前移，抵消跨日 spill`,
      suggestedDeltaMinutes: Math.min(
        20,
        Math.max(5, Math.ceil(node.temporal.crossDayRisk * 30)),
      ),
      priority: 9,
      confidence: 0.55,
      metadata: { source: 'IR_WITNESS', domain: 'CROSS_DAY' },
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/** TRAVERSE 高代价边 → 对端点关联槽位给出压缩建议（IR 步级入口，非槽位扫描）。 */
function traverseStressRepairs(
  ir: ExecutionIR,
  witness: ExecutionTruthDAG,
  plan: RepairEvaluatorInput['plan'],
  caps: ReturnType<typeof microRepairCaps>,
): RepairInstruction[] {
  const edgeById = new Map(witness.edges.map(e => [e.id, e]));
  const nodeById = new Map(witness.nodes.map(n => [n.id, n]));
  const out: RepairInstruction[] = [];
  let k = 0;

  for (const step of ir.steps) {
    if (step.type !== 'TRAVERSE' || step.cost < caps.highTraverseCost) {
      continue;
    }
    const edge = edgeById.get(step.edgeId);
    if (!edge) {
      continue;
    }
    for (const nid of [edge.from, edge.to]) {
      const node = nodeById.get(nid);
      const slotId = node?.slotId;
      if (!slotId) {
        continue;
      }
      const found = findSlot(plan, slotId);
      if (!found || found.slot.locked || found.slot.priorityTag !== 'optional') {
        continue;
      }
      out.push({
        id: `ir_traverse_stress_${step.edgeId}_${slotId}_${k++}`,
        action: 'COMPRESS_STOP',
        targetSlotIds: [slotId],
        date: found.date,
        narrative: `IR×witness：边 ${step.edgeId} TRAVERSE cost=${step.cost}（≥${caps.highTraverseCost}）→ 压缩可选「${found.slot.title}」`,
        suggestedDeltaMinutes: caps.compressCap,
        priority: 11,
        confidence: 0.56,
        metadata: {
          source: 'IR_WITNESS',
          domain: 'TRAVERSE_STRESS',
          edgeId: step.edgeId,
          traverseCost: step.cost,
        },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

export function evaluateMinimalRepairsIRBinding(
  input: RepairEvaluatorInput,
): RepairEvaluationResult {
  const ir = input.executionIR;
  const witness = input.executionTruthDAG;
  if (!ir?.steps?.length || !witness?.nodes?.length) {
    throw new Error(
      'REPAIR_IR_BINDING_REQUIRES_IR_AND_WITNESS: set executionIR + executionTruthDAG before RepairEvaluator',
    );
  }

  assertIRCreatedOnlyByCompiler(ir, 'RepairEvaluator.evaluateMinimalRepairsIRBinding');
  assertRepairIRWitnessAligned(ir, witness, 'RepairEvaluator.evaluateMinimalRepairsIRBinding');

  const irRun = executeExecutionIR(ir, witness);
  if (!irRun.ok) {
    throw new Error(
      `REPAIR_IR_BINDING_IR_FAILED: ${irRun.failures.join('; ')} — witness does not satisfy IR CHECK`,
    );
  }

  const caps = microRepairCaps(input.policies);
  const nodeById = new Map(witness.nodes.map(n => [n.id, n]));

  const repairs: RepairInstruction[] = [];
  let idCounter = 0;

  let totalDelayProxy = 0;
  const seenCheck = new Set<string>();

  for (const step of ir.steps) {
    if (step.type !== 'CHECK') {
      continue;
    }
    if (seenCheck.has(step.nodeId)) {
      continue;
    }
    seenCheck.add(step.nodeId);
    const node = nodeById.get(step.nodeId);
    if (!node) {
      continue;
    }
    totalDelayProxy += node.execution.delayMinutes ?? 0;
    repairs.push(...daylightRepairsForWitnessNode(node, input.plan, caps, idCounter));
    idCounter += 8;
    repairs.push(...crossDayRepairsFromWitnessNode(node, input.plan, caps, idCounter));
    idCounter += 4;
  }

  repairs.push(...pressureRepairsFromIRWitness(input, witness, ir, caps, totalDelayProxy));
  repairs.push(...traverseStressRepairs(ir, witness, input.plan, caps));
  repairs.push(...collectFuelReachabilityRepairs(input));

  const sorted = repairs.sort((a, b) => a.priority - b.priority);

  const overlayMode = Boolean(input.executionOverlayFrames?.length);
  const dagPatches = overlayMode && witness ? buildGraphPatchesFromRepairs(witness, sorted) : undefined;

  return {
    repairs: sorted,
    ...(dagPatches?.length ? { dagPatches } : {}),
    overnightRestructuringProposals: undefined,
    suggestReevaluateExecutionQuality: sorted.length > 0,
    notes: [
      'P8-3 RepairEvaluator：IR 为唯一执行真相；无 semantic / daylight 并行入口',
      'P8-2-B CHECK×witness daylight/cross-day；延误聚合；高代价 TRAVERSE 应力',
      `IR witness aligned dagId=${ir.meta.dagId} pathCost=${irRun.pathCost.toFixed(1)}`,
    ],
  };
}
