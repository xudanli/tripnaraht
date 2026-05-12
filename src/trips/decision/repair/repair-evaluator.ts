/**
 * RepairEvaluator v0：基于日照违规 + 天气 SEQUENCE 延误压力的极简启发式。
 * 输出有序、可逐项采纳的局部修复建议 —— 非 full replan。
 */

import type { RepairEvaluationResult, RepairInstruction } from './repair-action.types';
import { assertOverlayOnly } from '../../execution-overlay/overlay-decision-policy';
import {
  assertDAGCanonicalRepairInputs,
  isRepairIROnlyLockEnabled,
} from '../../execution-truth-dag/dag-canonical-policy';
import { isDagObserverOnlyEnabled } from '../../execution-truth-dag/dag-observer-lock';
import { evaluateMinimalRepairsIRBinding } from './repair-evaluator-ir-binding';
import { buildGraphPatchesFromRepairs } from '../../execution-truth-dag/build-graph-patches';
import { collectOvernightRestructuringProposals } from '../restructuring/collect-overnight-restructuring-proposals';
import type { RepairEvaluatorInput } from './repair-evaluator.types';
import type { PlanSlot } from '../plan-model';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';
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

function sumSequenceDriftMinutes(drifts: RepairEvaluatorInput['timeDrifts']): number {
  return drifts
    .filter(d => d.propagationPolicy === 'PROPAGATE_SEQUENCE')
    .reduce((s, d) => s + d.deltaMinutes, 0);
}

function collectDaylightRepairs(input: RepairEvaluatorInput): RepairInstruction[] {
  const caps = microRepairCaps(input.policies);
  const df = input.daylightFeasibility;
  if (!df?.slotsEndingAfterCivilDusk?.length) {
    return [];
  }

  const out: RepairInstruction[] = [];
  let i = 0;

  for (const slotId of df.slotsEndingAfterCivilDusk) {
    const found = findSlot(input.plan, slotId);
    if (!found) {
      continue;
    }
    const { date, slot } = found;
    if (slot.locked) {
      out.push({
        id: `repair_daylight_locked_${slotId}_${i++}`,
        action: 'SHORTEN_ACTIVITY',
        targetSlotIds: [slotId],
        date,
        narrative: `暮光后仍在途：槽位 locked，仅建议缩短活动或改日（无法自动前移）`,
        suggestedDeltaMinutes: Math.min(caps.compressCap, caps.daylightShift),
        priority: 15,
        confidence: 0.55,
        metadata: { source: 'DAYLIGHT_FEASIBILITY', locked: true },
      });
      continue;
    }

    if (slot.priorityTag === 'optional') {
      out.push({
        id: `repair_skip_opt_${slotId}_${i++}`,
        action: 'SKIP_OPTIONAL_POI',
        targetSlotIds: [slotId],
        date,
        narrative: `民用暮光后结束「${slot.title}」：可选段可跳过以回收时间`,
        priority: 8,
        confidence: 0.72,
        metadata: { source: 'DAYLIGHT_FEASIBILITY' },
      });
    }

    out.push({
      id: `repair_move_earlier_${slotId}_${i++}`,
      action: 'MOVE_SLOT_EARLIER',
      targetSlotIds: [slotId],
      date,
      narrative: `将「${slot.title}」整体前移，避免暮光后仍在户外/行车`,
      suggestedDeltaMinutes: caps.daylightShift,
      priority: 5,
      confidence: 0.68,
      metadata: { source: 'DAYLIGHT_FEASIBILITY' },
    });

    if (slot.endTime) {
      out.push({
        id: `repair_shorten_${slotId}_${i++}`,
        action: 'SHORTEN_ACTIVITY',
        targetSlotIds: [slotId],
        date,
        narrative: `压缩「${slot.title}」停留时长 ${caps.compressCap}min 内`,
        suggestedDeltaMinutes: caps.compressCap,
        priority: 7,
        confidence: 0.62,
        metadata: { source: 'DAYLIGHT_FEASIBILITY' },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function collectWeatherPressureRepairs(
  input: RepairEvaluatorInput,
): RepairInstruction[] {
  const caps = microRepairCaps(input.policies);
  const seqSum = sumSequenceDriftMinutes(input.timeDrifts);
  if (seqSum < caps.seqThreshold) {
    return [];
  }

  const cap =
    typeof input.policies?.bufferMinBetweenActivities === 'number'
      ? Math.min(caps.compressCap, input.policies.bufferMinBetweenActivities + 30)
      : caps.compressCap;

  const out: RepairInstruction[] = [];
  let k = 0;

  for (const day of input.plan.days) {
    const degraded =
      day.weatherExecution?.executionState === 'DEGRADED' ||
      day.weatherExecution?.executionState === 'HIGH_RISK';
    if (!degraded) {
      continue;
    }

    for (const slot of day.timeSlots) {
      if (slot.priorityTag !== 'optional') {
        continue;
      }
      if (slot.locked) {
        continue;
      }
      out.push({
        id: `repair_compress_${slot.id}_${k++}`,
        action: 'COMPRESS_STOP',
        targetSlotIds: [slot.id],
        date: day.date,
        narrative: `天气 SEQUENCE 累积延误 ~${seqSum}min：压缩可选停留「${slot.title}」至多 ${cap}min`,
        suggestedDeltaMinutes: cap,
        priority: 12,
        confidence: 0.58,
        metadata: {
          source: 'WEATHER_SEQUENCE_PRESSURE',
          sequenceSumMinutes: seqSum,
        },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/** -------- P5-1 overlay-only collectors（唯一执行真相：ExecutionOverlayFrame） -------- */

function dateForSlot(plan: RepairEvaluatorInput['plan'], slotId: string): string | undefined {
  for (const day of plan.days) {
    if (day.timeSlots.some(s => s.id === slotId)) {
      return day.date;
    }
  }
  return undefined;
}

function collectOverlayDaylightRepairs(input: RepairEvaluatorInput): RepairInstruction[] {
  const caps = microRepairCaps(input.policies);
  const frames = input.executionOverlayFrames ?? [];
  const out: RepairInstruction[] = [];
  let i = 0;

  for (const f of frames) {
    if (!f.temporal.daylightViolation) {
      continue;
    }
    const found = findSlot(input.plan, f.legId);
    if (!found) {
      continue;
    }
    const { date, slot } = found;
    if (slot.locked) {
      out.push({
        id: `repair_overlay_daylight_locked_${f.legId}_${i++}`,
        action: 'SHORTEN_ACTIVITY',
        targetSlotIds: [f.legId],
        date,
        narrative: `执行叠加层：暮光后仍在途（overlay daylightViolation）；locked 槽仅建议缩短或改日`,
        suggestedDeltaMinutes: Math.min(caps.compressCap, caps.daylightShift),
        priority: 15,
        confidence: 0.55,
        metadata: { source: 'EXECUTION_OVERLAY', domain: 'DAYLIGHT', locked: true },
      });
      continue;
    }

    if (slot.priorityTag === 'optional') {
      out.push({
        id: `repair_overlay_daylight_skip_${f.legId}_${i++}`,
        action: 'SKIP_OPTIONAL_POI',
        targetSlotIds: [f.legId],
        date,
        narrative: `执行叠加层：民用暮光后结束「${slot.title}」`,
        priority: 8,
        confidence: 0.72,
        metadata: { source: 'EXECUTION_OVERLAY', domain: 'DAYLIGHT' },
      });
    }

    out.push({
      id: `repair_overlay_daylight_move_${f.legId}_${i++}`,
      action: 'MOVE_SLOT_EARLIER',
      targetSlotIds: [f.legId],
      date,
      narrative: `执行叠加层：前移「${slot.title}」，回收暮光后风险`,
      suggestedDeltaMinutes: caps.daylightShift,
      priority: 5,
      confidence: 0.68,
      metadata: { source: 'EXECUTION_OVERLAY', domain: 'DAYLIGHT' },
    });

    if (slot.endTime) {
      out.push({
        id: `repair_overlay_daylight_shorten_${f.legId}_${i++}`,
        action: 'SHORTEN_ACTIVITY',
        targetSlotIds: [f.legId],
        date,
        narrative: `执行叠加层：压缩「${slot.title}」停留至多 ${caps.compressCap}min`,
        suggestedDeltaMinutes: caps.compressCap,
        priority: 7,
        confidence: 0.62,
        metadata: { source: 'EXECUTION_OVERLAY', domain: 'DAYLIGHT' },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function collectOverlayPressureRepairs(input: RepairEvaluatorInput): RepairInstruction[] {
  const caps = microRepairCaps(input.policies);
  const frames = input.executionOverlayFrames ?? [];
  if (!frames.length) {
    return [];
  }

  /** P5-1：延误压力只读根级 unifiedDelayMinutes（与 temporal.unifiedDelayMinutes 同源；不用 drift 聚合冒充 SEQUENCE）。 */
  const pressureMetric = frames.reduce((s, f) => s + f.unifiedDelayMinutes, 0);
  if (pressureMetric < caps.seqThreshold) {
    return [];
  }

  const cap =
    typeof input.policies?.bufferMinBetweenActivities === 'number'
      ? Math.min(caps.compressCap, input.policies.bufferMinBetweenActivities + 30)
      : caps.compressCap;

  const out: RepairInstruction[] = [];
  let k = 0;

  for (const day of input.plan.days) {
    const dayLegIds = new Set(
      day.timeSlots.filter(s => s.travelLegFromPrev).map(s => s.id),
    );
    const dayFrames = frames.filter(f => dayLegIds.has(f.legId));
    const stressed = dayFrames.some(
      f =>
        f.finalExecutionState === 'DEGRADED' || f.finalExecutionState === 'HIGH_RISK',
    );
    if (!stressed) {
      continue;
    }

    for (const slot of day.timeSlots) {
      if (slot.priorityTag !== 'optional') {
        continue;
      }
      if (slot.locked) {
        continue;
      }
      out.push({
        id: `repair_overlay_compress_${slot.id}_${k++}`,
        action: 'COMPRESS_STOP',
        targetSlotIds: [slot.id],
        date: day.date,
        narrative: `执行叠加层：延误压力≈${Math.round(pressureMetric)}min（frame 聚合）：压缩可选停留「${slot.title}」至多 ${cap}min`,
        suggestedDeltaMinutes: cap,
        priority: 12,
        confidence: 0.58,
        metadata: {
          source: 'EXECUTION_OVERLAY',
          domain: 'DELAY_PRESSURE',
          pressureMetricMinutes: pressureMetric,
        },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function collectOverlayCrossDayMitigationRepairs(
  input: RepairEvaluatorInput,
): RepairInstruction[] {
  const caps = microRepairCaps(input.policies);
  const frames = input.executionOverlayFrames ?? [];
  const out: RepairInstruction[] = [];
  let i = 0;

  for (const f of frames) {
    if (f.temporal.crossDayRisk < 0.25) {
      continue;
    }
    const src = findSlot(input.plan, f.legId);
    if (src && !src.slot.locked) {
      const delta = Math.min(Math.ceil(f.temporal.crossDayRisk * 60), caps.crossDayCap);
      out.push({
        id: `repair_overlay_early_dep_${f.legId}_${i}`,
        action: 'EARLY_DEPARTURE',
        targetSlotIds: [f.legId],
        date: src.date,
        narrative: `执行叠加层：跨日风险 ${(f.temporal.crossDayRisk * 100).toFixed(0)}%：前移/提早结束「${src.slot.title}」至多 ${delta}min`,
        suggestedDeltaMinutes: Math.max(5, delta),
        priority: 6,
        confidence: 0.65,
        metadata: {
          source: 'EXECUTION_OVERLAY',
          domain: 'CROSS_DAY',
          crossDayRisk: f.temporal.crossDayRisk,
        },
      });
      i += 1;
    }

    const spillDate = dateForSlot(input.plan, f.legId);
    if (!spillDate) {
      continue;
    }
    const targetDay = input.plan.days.find(day => day.date === spillDate);
    if (!targetDay?.timeSlots?.length) {
      continue;
    }
    const sorted = [...targetDay.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );
    const head = sorted.find(s => !s.locked);
    if (head && head.id !== f.legId) {
      out.push({
        id: `repair_overlay_head_earlier_${spillDate}_${i}`,
        action: 'MOVE_SLOT_EARLIER',
        targetSlotIds: [head.id],
        date: spillDate,
        narrative: `执行叠加层：次日首段「${head.title}」前移，抵消跨日 spill`,
        suggestedDeltaMinutes: Math.min(
          20,
          Math.max(5, Math.ceil(f.temporal.crossDayRisk * 30)),
        ),
        priority: 9,
        confidence: 0.55,
        metadata: { source: 'EXECUTION_OVERLAY', domain: 'CROSS_DAY' },
      });
      i += 1;
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/** 跨日 PROPAGATE_CROSS_DAY：缓解前一日末段 + 次日首段（与 propagate-cross-day 语义对齐） */
function collectCrossDayMitigationRepairs(
  input: RepairEvaluatorInput,
): RepairInstruction[] {
  const caps = microRepairCaps(input.policies);
  const cross = input.timeDrifts.filter(
    d => d.propagationPolicy === 'PROPAGATE_CROSS_DAY' && d.deltaMinutes > 0,
  );
  const out: RepairInstruction[] = [];
  let i = 0;

  for (const d of cross) {
    const src = findSlot(input.plan, d.sourceSlotId);
    if (src && !src.slot.locked) {
      const delta = Math.min(d.deltaMinutes, caps.crossDayCap);
      out.push({
        id: `repair_early_dep_${d.sourceSlotId}_${i}`,
        action: 'EARLY_DEPARTURE',
        targetSlotIds: [d.sourceSlotId],
        date: src.date,
        narrative: `跨日延误 ${d.deltaMinutes}min 挤压次日：前移/提早结束「${src.slot.title}」至多 ${delta}min`,
        suggestedDeltaMinutes: delta,
        priority: 6,
        confidence: 0.65,
        metadata: {
          source: 'CROSS_DAY_SPILLOVER',
          driftId: d.id,
          spillTargetDate: d.date,
        },
      });
      i += 1;
    }

    const targetDay = input.plan.days.find(day => day.date === d.date);
    if (!targetDay?.timeSlots?.length) {
      continue;
    }
    const sorted = [...targetDay.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );
    const head = sorted.find(s => !s.locked);
    if (head) {
      out.push({
        id: `repair_head_earlier_${d.date}_${i}`,
        action: 'MOVE_SLOT_EARLIER',
        targetSlotIds: [head.id],
        date: d.date,
        narrative: `次日首段「${head.title}」再前移，部分抵消跨日 spill`,
        suggestedDeltaMinutes: Math.min(
          20,
          Math.max(5, Math.ceil(d.deltaMinutes / 2)),
        ),
        priority: 9,
        confidence: 0.55,
        metadata: { source: 'CROSS_DAY_SPILLOVER', driftId: d.id },
      });
      i += 1;
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/**
 * Booking v0：酒店抵达晚于策略给出的最晚入住参考 → DELAY_CHECKIN + 可选前移上一段 transport。
 */
/**
 * 极光 / 夜间观测：云厚或 KP 不足导致 observationFeasibility=blocked 时，
 * 对打上 semanticTags 的槽位给出 SKIP / SWAP，并在 metadata 里留给 Neptune 做南岸换宿等走廊替换。
 */
function collectAuroraNightObservationRepairs(
  input: RepairEvaluatorInput,
): RepairInstruction[] {
  const summary = input.nightObservationFeasibility;
  if (!summary?.infeasibleAuroraSlotIds?.length) {
    return [];
  }

  const idSet = new Set(summary.infeasibleAuroraSlotIds);
  const out: RepairInstruction[] = [];
  let i = 0;

  for (const day of input.plan.days) {
    for (const slot of day.timeSlots) {
      if (!idSet.has(slot.id)) {
        continue;
      }

      if (slot.priorityTag === 'optional' && !slot.locked) {
        out.push({
          id: `repair_aurora_skip_${slot.id}_${i++}`,
          action: 'SKIP_OPTIONAL_POI',
          targetSlotIds: [slot.id],
          date: day.date,
          narrative: `云层/KP 不利于极光观测：可跳过可选夜间段「${slot.title}」，改由南岸或次日补窗`,
          priority: 6,
          confidence: 0.65,
          metadata: {
            source: 'AURORA_NIGHT_OBSERVATION',
            domain: 'AURORA',
            hint: 'RELAX_OR_RESCHEDULE_NIGHT_OBSERVATION',
          },
        });
      } else {
        const mig = input.opportunityMigrationEvaluations?.find(m => m.date === day.date);
        out.push({
          id: `repair_aurora_swap_${slot.id}_${i++}`,
          action: 'SWAP_POI',
          targetSlotIds: [slot.id],
          date: day.date,
          narrative: `首都圈/当前锚点云厚：考虑将「${slot.title}」换至更暗空地区（如南岸 Vik 一带过夜）或改日`,
          priority: 9,
          confidence: 0.55,
          ...(mig
            ? {
                opportunityMigrationEvaluation: {
                  tradeoffScore: mig.tradeoffScore,
                  expectedGain: mig.expectedOpportunityGain,
                  recommendation: mig.recommendation,
                  appliedThreshold: mig.appliedThreshold,
                },
              }
            : {}),
          metadata: {
            source: 'AURORA_NIGHT_OBSERVATION',
            domain: 'AURORA',
            neptuneHint: 'REGION_SWAP_SOUTH_COAST',
            blockedDates: summary.blockedObservationDates,
            ...(mig?.recommendation === 'MIGRATE'
              ? { migrationEconomicsApproved: true }
              : {}),
          },
        });
      }
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function collectBookingHotelRepairs(
  input: RepairEvaluatorInput,
): RepairInstruction[] {
  const latest = input.policies?.microRepair?.hotelCheckinLatest;
  if (!latest) {
    return [];
  }

  const latestM = parseIsoTimeToMinutes(latest);
  const out: RepairInstruction[] = [];
  let i = 0;

  for (const day of input.plan.days) {
    const sorted = [...day.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );

    for (const slot of day.timeSlots) {
      if (slot.type !== 'hotel') {
        continue;
      }
      const arrivalM = parseIsoTimeToMinutes(slot.time);
      if (arrivalM <= latestM) {
        continue;
      }

      const gapMin = arrivalM - latestM;

      out.push({
        id: `repair_delay_checkin_${slot.id}_${i++}`,
        action: 'DELAY_CHECKIN',
        targetSlotIds: [slot.id],
        date: day.date,
        narrative: `抵达酒店 ${slot.time} 晚于参考最晚入住窗口 ${latest}：协调 late check-in 或前移路上段`,
        suggestedDeltaMinutes: Math.min(45, gapMin),
        priority: 11,
        confidence: 0.7,
        metadata: {
          source: 'BOOKING_HOTEL_CHECKIN',
          domain: 'BOOKING',
          hotelCheckinLatest: latest,
          arrivalTime: slot.time,
        },
      });

      const idx = sorted.findIndex(s => s.id === slot.id);
      if (idx > 0) {
        const prev = sorted[idx - 1];
        if (!prev.locked && prev.type === 'transport') {
          out.push({
            id: `repair_booking_transport_${prev.id}_${i++}`,
            action: 'MOVE_SLOT_EARLIER',
            targetSlotIds: [prev.id],
            date: day.date,
            narrative: `前移抵达前的「${prev.title}」至多 ${Math.min(40, gapMin)}min，贴近入住窗口`,
            suggestedDeltaMinutes: Math.min(40, gapMin),
            priority: 10,
            confidence: 0.62,
            metadata: { source: 'BOOKING_HOTEL_CHECKIN', domain: 'BOOKING' },
          });
        }
      }
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/**
 * 产出最小可行修复集合（v0 启发式）；调用方可合并排序后展示或逐项应用。
 */
export function evaluateMinimalRepairs(
  input: RepairEvaluatorInput,
): RepairEvaluationResult {
  assertOverlayOnly(
    input.plan,
    input.executionOverlayFrames,
    input.policies,
    'RepairEvaluator.evaluateMinimalRepairs',
  );

  assertDAGCanonicalRepairInputs(
    input.plan,
    input.policies,
    input.executionOverlayFrames,
    input.executionTruthDAG,
    'RepairEvaluator.evaluateMinimalRepairs',
  );

  const dagObserverOnly = isDagObserverOnlyEnabled(input.policies);

  /**
   * P8-3：存在 **ExecutionIR + witness DAG** 时 —— 唯一执行真相为 IR，禁止 daylight / semantic / overlay 启发式并行入口。
   * P-Next 4：`dagObserverOnly` —— IR/DAG 不参与 repair 决策；走启发式 + fuel。
   */
  if (
    !dagObserverOnly &&
    input.executionIR?.steps?.length &&
    input.executionTruthDAG?.nodes?.length
  ) {
    return evaluateMinimalRepairsIRBinding(input);
  }

  if (!dagObserverOnly && isRepairIROnlyLockEnabled(input.policies)) {
    return evaluateMinimalRepairsIRBinding(input);
  }

  const caps = microRepairCaps(input.policies);
  const overlayMode = Boolean(input.executionOverlayFrames?.length);
  const traceOnly = Boolean(
    input.policies?.overlayExplanationOnly && input.physicsFieldIndex != null,
  );
  const effectiveOverlayMode = overlayMode && !traceOnly;

  const daylightRepairs = effectiveOverlayMode
    ? collectOverlayDaylightRepairs(input)
    : collectDaylightRepairs(input);
  const pressureRepairs = effectiveOverlayMode
    ? collectOverlayPressureRepairs(input)
    : collectWeatherPressureRepairs(input);
  const crossDayRepairs = effectiveOverlayMode
    ? collectOverlayCrossDayMitigationRepairs(input)
    : collectCrossDayMitigationRepairs(input);
  /** Overlay 真相态：booking / aurora 不单独开决策枝 — 仅 annotations（frame.annotations）；遗留路径仅在无帧时启用。 */
  const bookingRepairs = effectiveOverlayMode ? [] : collectBookingHotelRepairs(input);
  const auroraRepairs = effectiveOverlayMode ? [] : collectAuroraNightObservationRepairs(input);
  const fuelRepairs = collectFuelReachabilityRepairs(input);
  const overnightProposals = collectOvernightRestructuringProposals({
    overnightRestructuringPressures: input.overnightRestructuringPressures,
    legTemporalSafetyAssessments: effectiveOverlayMode ? undefined : input.legTemporalSafetyAssessments,
    opportunityMigrationEvaluations: input.opportunityMigrationEvaluations,
    overlaySurfaceOnly: effectiveOverlayMode,
  });
  const repairs = [
    ...daylightRepairs,
    ...pressureRepairs,
    ...crossDayRepairs,
    ...bookingRepairs,
    ...auroraRepairs,
    ...fuelRepairs,
  ];

  const sorted = repairs.sort((a, b) => a.priority - b.priority);
  const seqSum = effectiveOverlayMode
    ? (input.executionOverlayFrames ?? []).reduce((s, f) => s + f.unifiedDelayMinutes, 0)
    : sumSequenceDriftMinutes(input.timeDrifts);

  const hasOvernightProposal = overnightProposals.some(
    p =>
      p.proposedAction !== 'KEEP_CURRENT' ||
      p.restructuringPressureApproved ||
      p.pressureSeverity !== 'LOW',
  );

  const dagPatches =
    effectiveOverlayMode && input.executionTruthDAG && !dagObserverOnly
      ? buildGraphPatchesFromRepairs(input.executionTruthDAG, sorted)
      : undefined;

  return {
    repairs: sorted,
    ...(dagPatches?.length ? { dagPatches } : {}),
    overnightRestructuringProposals:
      overnightProposals.length > 0 ? overnightProposals : undefined,
    suggestReevaluateExecutionQuality:
      sorted.length > 0 &&
      (daylightRepairs.length > 0 ||
        seqSum >= caps.seqThreshold ||
        crossDayRepairs.length > 0 ||
        bookingRepairs.length > 0 ||
        auroraRepairs.length > 0 ||
        fuelRepairs.length > 0 ||
        hasOvernightProposal),
    notes:
      sorted.length > 0 || hasOvernightProposal
        ? [
            traceOnly
              ? 'P-Next 3 RepairEvaluator（overlay trace-only）：因果修复不读 overlay 叙事字段'
              : overlayMode
                ? 'P5-1 RepairEvaluator（overlay-only）：局部建议来自 ExecutionOverlayFrame'
                : 'v0 RepairEvaluator：局部建议；采纳后请重跑决策管线更新 safeScore',
            ...(hasOvernightProposal
              ? ['含 overnight 重构提案候选（非自动 apply）']
              : []),
          ]
        : undefined,
  };
}
