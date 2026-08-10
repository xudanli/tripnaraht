/**
 * Deterministic multi-day coverage assigner that consumes Iceland solver semantics.
 * Strategy: ICELAND_COVERAGE_DAY_ASSIGN@v1 — proves relation/dayScope/gate understanding.
 * Never writes PlanVersion.
 */

import {
  SOLVER_RESPONSE_SCHEMA_ID,
  type SolverCandidate,
  type SolverDayPlan,
  type SolverResponse,
} from '../../../decision-runtime/solver/contracts/solver-response';
import type { IcelandInitialPlanSolverProblemBundle } from './iceland-initial-plan-solver.adapter';
import type { InitialPlanDecision } from '../types/iceland-initial-plan-proposal.types';
import {
  estimateDriveMinutesBetweenPlaces,
  orderPlaceIdsHotelAnchored,
  sumDayDriveWithHotels,
} from '../utils/iceland-planning-place-coords.util';

export interface DayAssignSolveResult {
  response: SolverResponse;
  decisions: InitialPlanDecision[];
  writesPlanVersion: false;
}

export class IcelandInitialPlanDayAssignSolver {
  solve(bundle: IcelandInitialPlanSolverProblemBundle): DayAssignSolveResult {
    const started = Date.now();
    const { problem, semantics } = bundle;
    const decisions: InitialPlanDecision[] = [];

    type Slot = {
      dayId: string;
      nodeIds: string[];
      subregionByPack: Record<string, string>;
      serviceMin: number;
      driveMin: number;
    };

    const slots: Slot[] = semantics.dayIds.map((dayId) => ({
      dayId,
      nodeIds: [],
      subregionByPack: {},
      serviceMin: 0,
      driveMin: 0,
    }));

    const meta = semantics.nodeMetaById;
    const selected = new Set<string>();

    // Gate REJECT → never schedule
    for (const [nodeId, m] of Object.entries(meta)) {
      if (m.isForbidden || m.gateOutcome.status === 'BLOCK') {
        decisions.push({
          decisionId: `gate_block:${nodeId}`,
          kind: 'GATE_BLOCKED',
          placeId: m.placeId,
          reasons: m.gateOutcome.codes.length
            ? m.gateOutcome.codes
            : ['GATE_REJECT'],
        });
      }
    }

    // Soft-alt under pressure: if too many attractions vs capacity, keep higher reward
    const capacity =
      semantics.dayIds.length * semantics.maxActivitiesPerDay;
    const attractionNodes = Object.values(meta).filter(
      (m) => m.placeId != null && !m.isForbidden && m.reward > 0 && !m.experienceProductId,
    );
    const softDrop = new Set<string>();
    for (const pair of semantics.softAlternative) {
      const present = pair.nodeIds
        .map((id) => meta[id])
        .filter((m): m is NonNullable<typeof m> => Boolean(m) && !m.isForbidden);
      if (present.length < 2) continue;
      if (attractionNodes.length <= capacity && pair.policy === 'ALLOW_BOTH') {
        continue;
      }
      // Time pressure: keep higher reward
      const sorted = [...present].sort((a, b) => b.reward - a.reward);
      const keep = sorted[0]!;
      for (const drop of sorted.slice(1)) {
        softDrop.add(drop.nodeId);
        decisions.push({
          decisionId: `soft_alt:${pair.groupId}:${drop.nodeId}`,
          kind: 'TRIMMED_SOFT_ALT',
          placeId: drop.placeId,
          relatedPlaceIds: keep.placeId != null ? [keep.placeId] : undefined,
          reasons: ['DAILY_TIME_PRESSURE', 'LOWER_PREFERENCE_SCORE', `kept=${keep.placeId}`],
        });
      }
    }

    const parentOfChild = new Map(
      semantics.parentChildHard.map((pc) => [pc.childNodeId, pc.parentNodeId]),
    );

    // Candidate order: required first, then reward desc; skip children until parent picked
    const candidates = attractionNodes
      .filter((m) => !softDrop.has(m.nodeId))
      .sort((a, b) => {
        if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
        return b.reward - a.reward;
      });

    const tryPlace = (nodeId: string, preferDayIds?: string[]): boolean => {
      const m = meta[nodeId];
      if (!m || m.isForbidden || softDrop.has(nodeId) || selected.has(nodeId)) return false;

      // Child cannot schedule without parent cluster
      const parentId = parentOfChild.get(nodeId) ?? m.parentNodeId;
      if (parentId) {
        if (!selected.has(parentId)) {
          // Try schedule parent first
          if (!tryPlace(parentId, preferDayIds)) return false;
        }
        // Force same day as parent
        const parentDay = slots.find((s) => s.nodeIds.includes(parentId));
        if (!parentDay) return false;
        if (parentDay.nodeIds.includes(nodeId)) return true;
        if (parentDay.nodeIds.length >= semantics.maxActivitiesPerDay) return false;
        parentDay.nodeIds.push(nodeId);
        parentDay.serviceMin += m.serviceDurationMin;
        selected.add(nodeId);
        decisions.push({
          decisionId: `parent_child:${nodeId}`,
          kind: 'PARENT_CHILD_MERGED',
          placeId: m.placeId,
          relatedPlaceIds: meta[parentId]?.placeId != null ? [meta[parentId]!.placeId!] : undefined,
          dayIndex: Number(parentDay.dayId.replace('day-', '')),
          reasons: ['PARENT_CHILD_SAME_CLUSTER', 'NO_DOUBLE_REGION_STAY'],
        });
        return true;
      }

      const orderedSlots = [...slots].sort((a, b) => {
        if (preferDayIds?.length) {
          const aIdx = preferDayIds.indexOf(a.dayId);
          const bIdx = preferDayIds.indexOf(b.dayId);
          const aRank = aIdx >= 0 ? aIdx : preferDayIds.length + 1;
          const bRank = bIdx >= 0 ? bIdx : preferDayIds.length + 1;
          if (aRank !== bRank) return aRank - bRank;
        }
        // Prefer days where adding this POI keeps overnight / intra-day drive smaller
        const aCost = incrementalDriveCost(
          a,
          m.placeId,
          slots,
          meta,
          semantics.overnightStartPlaceIdByDayId,
        );
        const bCost = incrementalDriveCost(
          b,
          m.placeId,
          slots,
          meta,
          semantics.overnightStartPlaceIdByDayId,
        );
        if (aCost !== bCost) return aCost - bCost;
        return a.nodeIds.length - b.nodeIds.length;
      });

      const maxDrive = semantics.dailyDrivingLimitMin ?? 360;

      for (const slot of orderedSlots) {
        if (slot.nodeIds.length >= semantics.maxActivitiesPerDay) continue;
        if (slot.serviceMin + m.serviceDurationMin > semantics.maxServiceMinPerDay) continue;

        // Day scope: one subregion per pack per day
        if (
          m.packId &&
          m.subregionId &&
          semantics.dayScopePackIds.includes(m.packId)
        ) {
          const locked = slot.subregionByPack[m.packId];
          if (locked && locked !== m.subregionId) {
            continue;
          }
        }

        // Highlands pack: do not mix with non-highlands attractions same day
        if (m.packId === 'highlands') {
          const hasNonHighlands = slot.nodeIds.some(
            (id) => meta[id]?.packId && meta[id]!.packId !== 'highlands',
          );
          if (hasNonHighlands) continue;
        } else if (m.packId) {
          const hasHighlands = slot.nodeIds.some(
            (id) => meta[id]?.packId === 'highlands',
          );
          if (hasHighlands) continue;
        }

        const addDrive = incrementalDriveCost(
          slot,
          m.placeId,
          slots,
          meta,
          semantics.overnightStartPlaceIdByDayId,
        );
        if (slot.driveMin + addDrive > maxDrive) continue;

        slot.nodeIds.push(nodeId);
        slot.serviceMin += m.serviceDurationMin;
        slot.driveMin += addDrive;
        if (m.packId && m.subregionId && semantics.dayScopePackIds.includes(m.packId)) {
          slot.subregionByPack[m.packId] = m.subregionId;
        }
        selected.add(nodeId);
        decisions.push({
          decisionId: `include:${nodeId}`,
          kind: 'INCLUDED',
          placeId: m.placeId,
          dayIndex: Number(slot.dayId.replace('day-', '')),
          reasons: [
            m.packId === 'highlands' ? 'HIGHLANDS_EXPLICIT_BRANCH' : '',
            m.coverageRole === 'PRIMARY' ? 'GOLDEN_SET_PRIMARY' : 'GOLDEN_SET_CANDIDATE',
            'ROUTE_DIRECTION_FIT',
            addDrive > 0 ? `DRIVE_LEG_${addDrive}MIN` : '',
            ...(m.isRequired ? ['USER_REQUEST'] : []),
          ].filter(Boolean),
        });
        return true;
      }

      // No slot — if day-scope blocked across all days, record split need
      if (m.packId && semantics.dayScopePackIds.includes(m.packId) && m.subregionId) {
        decisions.push({
          decisionId: `day_scope:${nodeId}`,
          kind: 'DAY_SCOPE_SPLIT',
          placeId: m.placeId,
          reasons: [
            'CROSS_SUBREGION_REQUIRES_TRANSFER_DAY',
            `subregion=${m.subregionId}`,
          ],
        });
      }
      return false;
    };

    /**
     * Highlands explicit branch (highlandsRequiresExplicitBranch):
     * Place highland attractions BEFORE corridor packs so exclusive days are not
     * filled by south_coast / golden_circle / snaefellsnes first.
     * Prefer later days (trip "branch") while early days stay for ring/corridor.
     */
    const highlandPreferDayIds = [...slots.map((s) => s.dayId)].reverse();
    const highlandFirst = candidates
      .filter((c) => c.packId === 'highlands')
      .sort((a, b) => {
        if (a.countsTowardAttractionCoverage !== b.countsTowardAttractionCoverage) {
          return a.countsTowardAttractionCoverage ? -1 : 1;
        }
        if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
        return b.reward - a.reward;
      });
    for (const c of highlandFirst) {
      if (!selected.has(c.nodeId)) {
        tryPlace(c.nodeId, highlandPreferDayIds);
      }
    }

    // Co-visit: schedule clusters together preferentially
    for (const cluster of semantics.coVisitSoft) {
      const members = cluster.nodeIds.filter(
        (id) => meta[id] && !meta[id]!.isForbidden && !softDrop.has(id),
      );
      if (members.length < 2) continue;
      // Place first member, then force others onto same day
      const first = members[0]!;
      if (!selected.has(first)) tryPlace(first);
      const home = slots.find((s) => s.nodeIds.includes(first));
      if (!home) continue;
      for (const other of members.slice(1)) {
        if (selected.has(other)) continue;
        const m = meta[other]!;
        if (home.nodeIds.length >= semantics.maxActivitiesPerDay) break;
        if (
          m.packId &&
          m.subregionId &&
          semantics.dayScopePackIds.includes(m.packId)
        ) {
          const locked = home.subregionByPack[m.packId];
          if (locked && locked !== m.subregionId) continue;
        }
        // Do not pull non-highlands into a highland-only day (or vice versa)
        const homeHasHighlands = home.nodeIds.some(
          (id) => meta[id]?.packId === 'highlands',
        );
        if (m.packId === 'highlands' ? !homeHasHighlands && home.nodeIds.length > 0 : homeHasHighlands) {
          continue;
        }
        home.nodeIds.push(other);
        home.serviceMin += m.serviceDurationMin;
        selected.add(other);
        if (m.packId && m.subregionId) {
          home.subregionByPack[m.packId] = m.subregionId;
        }
        decisions.push({
          decisionId: `co_visit:${cluster.groupId}:${other}`,
          kind: 'CLUSTERED_CO_VISIT',
          placeId: m.placeId,
          relatedPlaceIds: meta[first]?.placeId != null ? [meta[first]!.placeId!] : undefined,
          dayIndex: Number(home.dayId.replace('day-', '')),
          reasons: ['CO_VISIT_CLUSTER', `group=${cluster.groupId}`],
        });
      }
    }

    for (const c of candidates) {
      if (!selected.has(c.nodeId)) tryPlace(c.nodeId);
    }

    // Reorder each day hotel-anchored when confirmed lodging known;
    // else seed from previous day's last POI.
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      if (slot.nodeIds.length === 0) continue;
      const placeIds = slot.nodeIds
        .map((id) => meta[id]?.placeId)
        .filter((p): p is number => typeof p === 'number');
      const startHotel = semantics.overnightStartPlaceIdByDayId?.[slot.dayId];
      const endHotel = semantics.overnightEndPlaceIdByDayId?.[slot.dayId];
      const prevLastFallback =
        i > 0
          ? meta[slots[i - 1]!.nodeIds[slots[i - 1]!.nodeIds.length - 1]!]?.placeId
          : undefined;
      const orderedPlaces = orderPlaceIdsHotelAnchored(
        placeIds,
        startHotel ?? prevLastFallback,
        endHotel,
      );
      const byPlace = new Map(
        slot.nodeIds.map((id) => [meta[id]?.placeId, id] as const),
      );
      slot.nodeIds = orderedPlaces
        .map((p) => byPlace.get(p))
        .filter((id): id is string => Boolean(id));
      const orderedPlaceIds = slot.nodeIds
        .map((id) => meta[id]?.placeId)
        .filter((p): p is number => typeof p === 'number');
      slot.driveMin = sumDayDriveWithHotels(
        orderedPlaceIds,
        startHotel ?? prevLastFallback,
        endHotel,
      );
      if ((startHotel ?? prevLastFallback) != null && orderedPlaceIds[0] != null) {
        const fromId = startHotel ?? prevLastFallback;
        const isArrivalGateway =
          i === 0 &&
          semantics.originGatewayPlaceId != null &&
          fromId === semantics.originGatewayPlaceId;
        const isDepartureGateway =
          endHotel != null &&
          semantics.exitGatewayPlaceId != null &&
          endHotel === semantics.exitGatewayPlaceId &&
          i === slots.length - 1;
        decisions.push({
          decisionId: `overnight_link:${slot.dayId}`,
          kind: 'INCLUDED',
          placeId: orderedPlaceIds[0],
          dayIndex: Number(slot.dayId.replace('day-', '')),
          reasons: [
            isArrivalGateway
              ? 'ARRIVAL_GATEWAY_ANCHOR'
              : startHotel != null
                ? 'HOTEL_OVERNIGHT_ANCHOR'
                : 'OVERNIGHT_CONTINUITY',
            `FROM_${isArrivalGateway ? 'AIRPORT' : startHotel != null ? 'HOTEL' : 'PREV_DAY_LAST'}_${fromId}`,
            `DRIVE_${estimateDriveMinutesBetweenPlaces(fromId, orderedPlaceIds[0])}MIN`,
            endHotel != null
              ? isDepartureGateway
                ? `TO_AIRPORT_${endHotel}`
                : `TO_HOTEL_${endHotel}`
              : '',
          ].filter(Boolean),
        });
      }
    }

    // Exclusions for unselected (non-forbidden)
    for (const m of attractionNodes) {
      if (!selected.has(m.nodeId) && !softDrop.has(m.nodeId) && !m.isForbidden) {
        decisions.push({
          decisionId: `exclude:${m.nodeId}`,
          kind: 'EXCLUDED',
          placeId: m.placeId,
          reasons: ['CAPACITY_OR_DAY_SCOPE', 'NOT_SELECTED'],
        });
      }
    }

    const dayPlans: SolverDayPlan[] = slots.map((s) => {
      let t = 600;
      const startMin = s.nodeIds.map((id) => {
        const start = t;
        t += (meta[id]?.serviceDurationMin ?? 60) + 25;
        return start;
      });
      return { dayId: s.dayId, nodeIds: s.nodeIds, startMin };
    });

    const objectiveValue = [...selected].reduce(
      (sum, id) => sum + (meta[id]?.reward ?? 0),
      0,
    );

    const candidate: SolverCandidate = {
      candidateId: `iceland-day-assign-${bundle.arrangeInputHash}`,
      operation: 'REROUTE',
      label: 'Iceland coverage day-assign v1',
      dayPlans,
      objectiveValue,
      satisfiedSolverConstraintIds: problem.constraints
        .filter((c) => c.hard)
        .map((c) => c.constraintId),
    };

    const status =
      selected.size === 0
        ? 'INFEASIBLE'
        : selected.size < Math.min(3, attractionNodes.filter((a) => !a.isForbidden).length)
          ? 'PARTIAL'
          : 'SOLVED';

    const response: SolverResponse = {
      schemaId: SOLVER_RESPONSE_SCHEMA_ID,
      requestId: problem.requestId,
      status,
      candidates: [candidate],
      solverMeta: {
        engine: 'OR_TOOLS_CP_SAT', // wire enum; actual strategy below
        version: 'iceland-coverage-day-assign@v1',
        strategy: 'ICELAND_COVERAGE_DAY_ASSIGN',
        nativeCpSat: false,
        seed: problem.solverConfig.seed,
        elapsedMs: Date.now() - started,
      },
      message: 'Deterministic Iceland day-assign (relation-aware); not PlanVersion authority',
    };

    return { response, decisions, writesPlanVersion: false };
  }
}

type DaySlot = {
  dayId: string;
  nodeIds: string[];
  subregionByPack: Record<string, string>;
  serviceMin: number;
  driveMin: number;
};

/**
 * Extra drive if we append `placeId` to `slot`.
 * Empty day: prefer morning hotel (confirmed overnight), else previous day's last POI.
 */
function incrementalDriveCost(
  slot: DaySlot,
  placeId: number | undefined,
  allSlots: DaySlot[],
  meta: IcelandInitialPlanSolverProblemBundle['semantics']['nodeMetaById'],
  overnightStartByDayId?: Record<string, number>,
): number {
  if (placeId == null) return 0;
  if (slot.nodeIds.length > 0) {
    const lastId = slot.nodeIds[slot.nodeIds.length - 1]!;
    return estimateDriveMinutesBetweenPlaces(meta[lastId]?.placeId, placeId);
  }
  const morningHotel = overnightStartByDayId?.[slot.dayId];
  if (morningHotel != null) {
    return estimateDriveMinutesBetweenPlaces(morningHotel, placeId);
  }
  const idx = allSlots.indexOf(slot);
  if (idx <= 0) return 0;
  const prev = allSlots[idx - 1]!;
  if (!prev.nodeIds.length) return 0;
  const prevLast = prev.nodeIds[prev.nodeIds.length - 1]!;
  return estimateDriveMinutesBetweenPlaces(meta[prevLast]?.placeId, placeId);
}
