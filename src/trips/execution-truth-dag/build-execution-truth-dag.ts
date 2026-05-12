/**
 * Builds ExecutionTruthDAG from overlay frames (+ optional temporal windows & repair hints).
 * Rule: node truth = ExecutionOverlayFrame ⊕ plan slot merge only — no weatherExecution / raw drift interpretation.
 */

import type { TripPlan } from '../decision/plan-model';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import type { WeatherOverlaySeverity } from '../execution-overlay/execution-overlay-frame.types';
import type { ExecutionState } from '../decision/hazard/travel-hazard.types';
import type { RepairInstruction } from '../decision/repair/repair-action.types';
import type { TemporalExecutionWindow } from '../decision/temporal/temporal-execution-window.types';
import { parseIsoTimeToMinutes } from '../decision/utils/weather-slot-delay.util';
import type {
  ExecutionEdge,
  ExecutionNode,
  ExecutionTruthDAG,
  ExecutionTruthFinalState,
  ExecutionTruthNodeType,
  ExecutionTruthRepairKind,
} from './execution-truth-dag.types';
import { nodeIdForSlot, slotIdFromNodeId } from './dag-node-ids';

/** Slot-id keyed temporal windows (engine `temporalExecutionWindowsBySlotId` may be partial). */
export type TemporalExecutionWindows = Partial<Record<string, TemporalExecutionWindow>>;

export interface BuildExecutionTruthDAGInput {
  plan: TripPlan;
  overlayFrames: ExecutionOverlayFrame[];
  temporalWindowsBySlot?: TemporalExecutionWindows;
  repairs?: RepairInstruction[];
}

function mapFinalState(frame: ExecutionOverlayFrame): ExecutionTruthFinalState {
  const s = frame.finalExecutionState;
  if (s === 'EXECUTABLE') {
    return frame.reliabilityScore < 0.45 ? 'SOFT' : 'OK';
  }
  const table: Record<ExecutionState, ExecutionTruthFinalState> = {
    EXECUTABLE: 'OK',
    DEGRADED: 'DEGRADED',
    HIGH_RISK: 'HARD',
    BLOCKED: 'BLOCKED',
  };
  return table[s] ?? 'OK';
}

function repairKindFromOverlay(frame: ExecutionOverlayFrame): ExecutionTruthRepairKind {
  if (!frame.repair.recommended) {
    return 'NONE';
  }
  const raw = (frame.repair.type ?? '').toUpperCase();
  if (raw.includes('RELOC') || raw.includes('SWAP')) {
    return 'RELOCATE';
  }
  if (raw.includes('SHIFT') || raw.includes('MOVE') || raw.includes('EARLY')) {
    return 'SHIFT';
  }
  if (raw.includes('COMPRESS') || raw.includes('SHORTEN')) {
    return 'COMPRESS';
  }
  return frame.finalExecutionState === 'HIGH_RISK' ? 'RELOCATE' : 'SHIFT';
}

function weatherExposure(wx: WeatherOverlaySeverity, delayFactor: number): number {
  const sev: Record<WeatherOverlaySeverity, number> = {
    LOW: 0.15,
    MEDIUM: 0.45,
    HIGH: 0.72,
    BLOCKED: 1,
  };
  const base = sev[wx] ?? 0.3;
  const bump = Math.min(0.25, Math.max(0, delayFactor - 1) * 0.35);
  return Math.min(1, base + bump);
}

function roadAccessibility(frame: ExecutionOverlayFrame): number {
  if (frame.road.blocked) {
    return 0;
  }
  if (frame.road.fRoadConstraint) {
    return 0.35;
  }
  return Math.max(0.12, frame.route.executionReliability ?? 0.72);
}

function arrivalRisk(frame: ExecutionOverlayFrame): number {
  const cd = frame.temporal.crossDayRisk;
  const dv = frame.temporal.daylightViolation ? 0.35 : 0;
  return Math.min(1, cd * 0.65 + dv);
}

function classifyNodeType(slotType: string, hasTravelLeg: boolean): ExecutionTruthNodeType {
  if (slotType === 'hotel') {
    return 'STAY';
  }
  if (hasTravelLeg || slotType === 'transport') {
    return 'LEG';
  }
  return 'ACTIVITY';
}

function buildNodes(plan: TripPlan, frames: ExecutionOverlayFrame[]): ExecutionNode[] {
  const byLeg = new Map(frames.map(f => [f.legId, f] as const));
  const out: ExecutionNode[] = [];

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const frame = byLeg.get(slot.id);
      if (!frame) {
        continue;
      }

      const geometryRef =
        slot.poiId ??
        (slot.coordinates
          ? `${slot.coordinates.lat.toFixed(4)},${slot.coordinates.lng.toFixed(4)}`
          : undefined);

      out.push({
        id: nodeIdForSlot(slot.id),
        date: day.date,
        slotId: slot.id,
        type: classifyNodeType(slot.type, Boolean(slot.travelLegFromPrev)),
        geometryRef,
        execution: {
          finalState: mapFinalState(frame),
          delayMinutes: frame.unifiedDelayMinutes,
          reliabilityScore: frame.reliabilityScore,
        },
        temporal: {
          daylightViolation: frame.temporal.daylightViolation,
          crossDayRisk: frame.temporal.crossDayRisk,
          arrivalRisk: arrivalRisk(frame),
        },
        weather: {
          exposureScore: weatherExposure(frame.weather.severity, frame.weather.delayFactor),
        },
        road: {
          accessibility: roadAccessibility(frame),
        },
        repair: {
          required: frame.repair.recommended,
          type: repairKindFromOverlay(frame),
        },
      });
    }
  }

  return out;
}

function orderedFrameSlotIdsForDay(
  plan: TripPlan,
  date: string,
  frameIds: Set<string>,
): string[] {
  const day = plan.days.find(d => d.date === date);
  if (!day) {
    return [];
  }
  return [...day.timeSlots]
    .filter(s => frameIds.has(s.id))
    .sort((a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time))
    .map(s => s.id);
}

function buildBaseEdges(plan: TripPlan, frames: ExecutionOverlayFrame[]): ExecutionEdge[] {
  const frameIds = new Set(frames.map(f => f.legId));
  const byLeg = new Map(frames.map(f => [f.legId, f] as const));
  const edges: ExecutionEdge[] = [];
  let edgeSeq = 0;
  const edgeId = (type: ExecutionEdge['type'], from: string, to: string) =>
    `${type}#${from}->${to}#${edgeSeq++}`;

  for (const day of plan.days) {
    const ordered = orderedFrameSlotIdsForDay(plan, day.date, frameIds);
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i]!;
      const to = ordered[i + 1]!;
      const dest = byLeg.get(to);
      if (!dest) {
        continue;
      }
      const fromN = nodeIdForSlot(from);
      const toN = nodeIdForSlot(to);
      edges.push({
        id: edgeId('TEMPORAL_SEQUENCE', fromN, toN),
        from: fromN,
        to: toN,
        type: 'TEMPORAL_SEQUENCE',
        weight: Math.max(0, dest.unifiedDelayMinutes + dest.temporal.crossDayRisk * 20),
      });
    }
  }

  for (let d = 0; d < plan.days.length - 1; d++) {
    const dayA = plan.days[d]!;
    const dayB = plan.days[d + 1]!;
    const orderedA = orderedFrameSlotIdsForDay(plan, dayA.date, frameIds);
    const orderedB = orderedFrameSlotIdsForDay(plan, dayB.date, frameIds);
    if (!orderedA.length || !orderedB.length) {
      continue;
    }
    const fromSlot = orderedA[orderedA.length - 1]!;
    const toSlot = orderedB[0]!;
    const fa = byLeg.get(fromSlot);
    const fb = byLeg.get(toSlot);
    if (!fa || !fb) {
      continue;
    }
    const spill =
      (fa.temporal.crossDayRisk + fb.temporal.crossDayRisk) * 30 +
      (fb.unifiedDelayMinutes + fa.unifiedDelayMinutes) * 0.25;
    const fromN = nodeIdForSlot(fromSlot);
    const toN = nodeIdForSlot(toSlot);
    edges.push({
      id: edgeId('CROSS_DAY_SPILL', fromN, toN),
      from: fromN,
      to: toN,
      type: 'CROSS_DAY_SPILL',
      weight: Math.max(0, spill),
    });
  }

  /** Route adjacency mirrors temporal chain for corridor-heavy plans — weights from reliability gap. */
  for (const day of plan.days) {
    const ordered = orderedFrameSlotIdsForDay(plan, day.date, frameIds);
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i]!;
      const to = ordered[i + 1]!;
      const fa = byLeg.get(from);
      const fb = byLeg.get(to);
      if (!fa || !fb) {
        continue;
      }
      const gap = 1 - Math.min(fa.route.executionReliability, fb.route.executionReliability);
      const fromN = nodeIdForSlot(from);
      const toN = nodeIdForSlot(to);
      edges.push({
        id: edgeId('ROUTE_DEPENDENCY', fromN, toN),
        from: fromN,
        to: toN,
        type: 'ROUTE_DEPENDENCY',
        weight: Math.max(0.02, gap),
      });
    }
  }

  /** Weather coupling on same adjacent legs — low separate weight (detail lives on nodes). */
  for (const day of plan.days) {
    const ordered = orderedFrameSlotIdsForDay(plan, day.date, frameIds);
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i]!;
      const to = ordered[i + 1]!;
      const fa = byLeg.get(from);
      const fb = byLeg.get(to);
      if (!fa || !fb) {
        continue;
      }
      const w = (weatherExposure(fa.weather.severity, fa.weather.delayFactor) +
        weatherExposure(fb.weather.severity, fb.weather.delayFactor)) *
        0.25;
      const fromN = nodeIdForSlot(from);
      const toN = nodeIdForSlot(to);
      edges.push({
        id: edgeId('WEATHER_DEPENDENCY', fromN, toN),
        from: fromN,
        to: toN,
        type: 'WEATHER_DEPENDENCY',
        weight: Math.min(1, Math.max(0, w)),
      });
    }
  }

  return edges;
}

const EDGE_MUTATING_ACTIONS = new Set<RepairInstruction['action']>([
  'COMPRESS_STOP',
  'SHORTEN_ACTIVITY',
  'MOVE_SLOT_EARLIER',
  'MOVE_SLOT_LATER',
  'EARLY_DEPARTURE',
  'DELAY_CHECKIN',
  'SPLIT_DRIVE',
]);

function applyRepairsToEdges(edges: ExecutionEdge[], repairs: RepairInstruction[]): ExecutionEdge[] {
  if (!repairs.length) {
    return edges;
  }

  return edges.map(edge => {
    const ids: string[] = [];
    let w = edge.weight;
    for (const r of repairs) {
      const touches = r.targetSlotIds.some(
        sid => edge.from === nodeIdForSlot(sid) || edge.to === nodeIdForSlot(sid),
      );
      if (!touches) {
        continue;
      }
      ids.push(r.id);
      if (EDGE_MUTATING_ACTIONS.has(r.action) && typeof r.suggestedDeltaMinutes === 'number') {
        w = Math.max(0, w - r.suggestedDeltaMinutes * 0.12);
      }
      if (r.action === 'SWAP_POI') {
        w = Math.max(0, w - 0.15);
      }
    }
    return {
      ...edge,
      weight: w,
      repairProposalIds: ids.length ? ids : edge.repairProposalIds,
    };
  });
}

function applyTemporalWindowHints(
  edges: ExecutionEdge[],
  temporalWindowsBySlot?: Partial<Record<string, TemporalExecutionWindow>>,
): ExecutionEdge[] {
  if (!temporalWindowsBySlot) {
    return edges;
  }
  return edges.map(e => {
    const a = temporalWindowsBySlot[slotIdFromNodeId(e.from)];
    const b = temporalWindowsBySlot[slotIdFromNodeId(e.to)];
    let bump = 0;
    if (a?.hardBoundary) {
      bump += 0.08;
    }
    if (b?.hardBoundary) {
      bump += 0.08;
    }
    return bump > 0 ? { ...e, weight: e.weight + bump } : e;
  });
}

/**
 * Single entry: overlay frames → DAG. Temporal windows sharpen explainability only (optional).
 */
export function buildExecutionTruthDAG(input: BuildExecutionTruthDAGInput): ExecutionTruthDAG {
  const frames = input.overlayFrames;
  const nodes = buildNodes(input.plan, frames);
  if (!nodes.length) {
    return { nodes: [], edges: [] };
  }

  let edges = buildBaseEdges(input.plan, frames);
  edges = applyTemporalWindowHints(edges, input.temporalWindowsBySlot);

  if (input.repairs?.length) {
    edges = applyRepairsToEdges(edges, input.repairs);
  }

  return { nodes, edges };
}
