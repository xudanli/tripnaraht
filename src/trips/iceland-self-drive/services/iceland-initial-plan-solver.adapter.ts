/**
 * Maps InitialPlanArrangeInput → SolverProblem + Iceland semantic projection.
 * Does not call OR-Tools sidecar; day-assign consumes this IR.
 * Never writes PlanVersion.
 */

import { createHash, randomUUID } from 'crypto';
import {
  SOLVER_PROBLEM_SCHEMA_ID,
  type OptimizationNode,
  type SolverConstraint,
  type SolverProblem,
} from '../../../decision-runtime/solver/contracts/solver-problem';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';
import type { IcelandSolverNodeMeta } from '../types/iceland-initial-plan-proposal.types';
import { mapConfirmedOvernightByDate } from '../utils/assign-confirmed-lodging-anchors.util';
import { resolveIcelandGatewayPlaceRef } from '../utils/iceland-gateway-location.util';

export interface IcelandSolverSemanticProjection {
  nodeMetaById: Record<string, IcelandSolverNodeMeta>;
  parentChildHard: Array<{ parentNodeId: string; childNodeId: string }>;
  /** Soft: prefer same day */
  coVisitSoft: Array<{ groupId: string; nodeIds: string[]; weight: number }>;
  softAlternative: Array<{
    groupId: string;
    nodeIds: string[];
    policy: 'ALLOW_BOTH' | 'PREFER_HIGHER_SCORE_WHEN_TIGHT';
  }>;
  /** Packs that require one subregion per natural day */
  dayScopePackIds: string[];
  dayIds: string[];
  datesByDayId: Record<string, string>;
  maxActivitiesPerDay: number;
  maxServiceMinPerDay: number;
  dailyDrivingLimitMin: number;
  /**
   * Drive-day anchors by dayId (not only lodging):
   * - start = morning hotel, or arrival gateway on day 1
   * - end = tonight's hotel, or departure gateway on last day
   */
  overnightStartPlaceIdByDayId: Record<string, number>;
  overnightEndPlaceIdByDayId: Record<string, number>;
  /** Resolved arrival / departure gateway placeIds (for diagnostics) */
  originGatewayPlaceId?: number;
  exitGatewayPlaceId?: number;
  writesPlanVersion: false;
}

export interface IcelandInitialPlanSolverProblemBundle {
  problem: SolverProblem;
  semantics: IcelandSolverSemanticProjection;
  arrangeInputHash: string;
  writesPlanVersion: false;
}

export interface AdaptArrangeToSolverContext {
  requestId?: string;
  /** Placeholder — proposal path never materializes PlanVersion */
  planVersionId?: string;
  startDate: string;
  endDate: string;
  dailyDrivingLimitMin?: number;
  maxActivitiesPerDay?: number;
  seed?: number;
}

function hashArrange(arrange: InitialPlanArrangeInput): string {
  const payload = {
    tripId: arrange.tripId,
    attractions: arrange.attractionCandidates.map((a) => ({
      id: a.canonicalPlaceId,
      score: a.score,
      role: a.coverageRole,
      sub: a.subregionId,
    })),
    soft: arrange.softAlternativePairs,
    co: arrange.coVisitClusters,
    pc: arrange.parentChild,
    scope: arrange.dayScopeRules.requireSubregionDayScopeByPack,
    origin: arrange.originGateway?.placeId,
    exit: arrange.exitGateway?.placeId,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function enumerateDays(startDate: string, endDate: string): Array<{ dayId: string; date: string; index: number }> {
  const out: Array<{ dayId: string; date: string; index: number }> = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [{ dayId: 'day-1', date: startDate, index: 1 }];
  }
  let i = 1;
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ dayId: `day-${i}`, date, index: i });
    i += 1;
  }
  return out;
}

function travelMinutesHeuristic(a: number, b: number): number {
  // Stable pseudo-distance from placeId — good enough for matrix shape / tests
  const d = Math.abs(a - b) % 97;
  return 20 + (d % 40);
}

export class IcelandInitialPlanSolverAdapter {
  /**
   * Arrange Input → SolverProblem + Iceland relation semantics.
   * PRIMARY/SECONDARY → reward; mustInclude → mandatory; Gate BLOCK → forbidden.
   */
  adapt(
    arrange: InitialPlanArrangeInput,
    ctx: AdaptArrangeToSolverContext,
  ): IcelandInitialPlanSolverProblemBundle {
    const days = enumerateDays(ctx.startDate, ctx.endDate);
    const dayIds = days.map((d) => d.dayId);
    const datesByDayId = Object.fromEntries(days.map((d) => [d.dayId, d.date]));
    const arrangeInputHash = hashArrange(arrange);

    const nodeMetaById: Record<string, IcelandSolverNodeMeta> = {};
    const nodes: OptimizationNode[] = [];
    const forbiddenNodeIds: string[] = [];
    const requiredNodeIds: string[] = [];

    // Soft-include support hubs as optional depots / anchors (not rewards)
    for (const s of arrange.supportNodes) {
      const nodeId = `support:${s.canonicalPlaceId}`;
      const meta: IcelandSolverNodeMeta = {
        nodeId,
        placeId: s.canonicalPlaceId,
        label: s.label,
        reward: 0,
        isRequired: false,
        isForbidden: false,
        regionId: s.regionId,
        countsTowardAttractionCoverage: false,
        gateOutcome: { status: 'PASS', codes: [] },
        evidence: {
          source: 'GOLDEN_SET',
          regionId: s.regionId,
          canonicalPlaceId: s.canonicalPlaceId,
          selectedBecause: ['support_node'],
          gateOutcome: { status: 'PASS', codes: [] },
        },
        serviceDurationMin: 0,
      };
      nodeMetaById[nodeId] = meta;
      nodes.push({
        nodeId,
        poiId: String(s.canonicalPlaceId),
        serviceDurationMin: 0,
        timeWindows: [{ startMin: 480, endMin: 1200 }],
        isMandatory: false,
        isBooked: false,
        canRemove: true,
        canMoveDay: true,
      });
    }

    for (const a of arrange.attractionCandidates) {
      const nodeId = `poi:${a.canonicalPlaceId}`;
      const gateBlocked = a.evidence.gateOutcome.status === 'BLOCK';
      const reward =
        (a.coverageRole === 'PRIMARY' ? 40 : a.coverageRole === 'SECONDARY' ? 20 : 5) +
        Math.round(a.score / 10);
      const isRequired = a.evidence.selectedBecause.includes('user_request');
      const isForbidden = gateBlocked;

      if (isForbidden) forbiddenNodeIds.push(nodeId);
      if (isRequired) requiredNodeIds.push(nodeId);

      const meta: IcelandSolverNodeMeta = {
        nodeId,
        placeId: a.canonicalPlaceId,
        label: a.label,
        reward: isForbidden ? -1e9 : reward,
        isRequired,
        isForbidden,
        subregionId: a.subregionId,
        packId: a.packId,
        regionId: a.regionId,
        coverageRole: a.coverageRole,
        parentNodeId:
          a.parentCanonicalPlaceId != null
            ? `poi:${a.parentCanonicalPlaceId}`
            : undefined,
        visitClusterId:
          a.parentCanonicalPlaceId != null
            ? `cluster:${a.parentCanonicalPlaceId}`
            : undefined,
        countsTowardAttractionCoverage: a.countsTowardAttractionCoverage,
        gateOutcome: a.evidence.gateOutcome,
        evidence: a.evidence,
        serviceDurationMin: 75,
      };
      nodeMetaById[nodeId] = meta;
      nodes.push({
        nodeId,
        poiId: String(a.canonicalPlaceId),
        serviceDurationMin: 75,
        timeWindows: [{ startMin: 540, endMin: 1080 }],
        isMandatory: isRequired && !isForbidden,
        isBooked: false,
        canRemove: !isRequired,
        canMoveDay: true,
      });
    }

    // Experiences as booking-dependent optional (not ordinary POI nodes in matrix)
    for (const exp of arrange.experienceCandidates) {
      const nodeId = `exp:${exp.experienceProductId}`;
      nodeMetaById[nodeId] = {
        nodeId,
        experienceProductId: exp.experienceProductId,
        label: exp.label,
        reward: 15,
        isRequired: false,
        isForbidden: false,
        packId: exp.packId,
        regionId: exp.regionId,
        countsTowardAttractionCoverage: false,
        gateOutcome: exp.gateOutcome,
        evidence: {
          source: 'EXPERIENCE',
          regionId: exp.regionId,
          selectedBecause: exp.selectedBecause,
          gateOutcome: exp.gateOutcome,
        },
        serviceDurationMin: exp.durationMinutes ?? 180,
      };
    }

    const parentChildHard = arrange.parentChild.map((pc) => ({
      parentNodeId: `poi:${pc.parentId}`,
      childNodeId: `poi:${pc.childId}`,
    }));

    const coVisitSoft = arrange.coVisitClusters.map((c) => ({
      groupId: c.groupId,
      nodeIds: c.placeIds.map((id) => `poi:${id}`),
      weight: 80,
    }));

    const softAlternative = arrange.softAlternativePairs.map((p) => ({
      groupId: p.groupId,
      nodeIds: p.placeIds.map((id) => `poi:${id}`),
      policy: p.policy,
    }));

    const dayScopePackIds = Object.entries(
      arrange.dayScopeRules.requireSubregionDayScopeByPack,
    )
      .filter(([, v]) => v)
      .map(([packId]) => packId);

    const constraints: SolverConstraint[] = [
      {
        constraintId: 'max_day_drive',
        kind: 'MAX_DAY_DRIVE_MIN',
        hard: true,
        payload: {
          maxDriveMin: ctx.dailyDrivingLimitMin ?? 360,
        },
      },
      ...parentChildHard.map((pc, i) => ({
        constraintId: `parent_child_${i}`,
        kind: 'BOOKED_PIN' as const,
        hard: true,
        payload: {
          icelandRelation: 'PARENT_CHILD',
          parentNodeId: pc.parentNodeId,
          childNodeId: pc.childNodeId,
          policy: 'child_requires_parent_same_day_cluster',
        },
      })),
      ...coVisitSoft.map((c, i) => ({
        constraintId: `co_visit_${i}`,
        kind: 'TIME_WINDOW' as const,
        hard: false,
        payload: {
          icelandRelation: 'CO_VISIT_CLUSTER',
          groupId: c.groupId,
          nodeIds: c.nodeIds,
          weight: c.weight,
          policy: 'prefer_same_day',
        },
      })),
      ...softAlternative.map((s, i) => ({
        constraintId: `soft_alt_${i}`,
        kind: 'REPLACE_POOL' as const,
        hard: false,
        payload: {
          icelandRelation: 'SOFT_ALTERNATIVE',
          groupId: s.groupId,
          nodeIds: s.nodeIds,
          policy: s.policy,
        },
      })),
      ...dayScopePackIds.map((packId) => ({
        constraintId: `day_scope_${packId}`,
        kind: 'DEPOT_FIXED' as const,
        hard: true,
        payload: {
          icelandRelation: 'DAY_SCOPE',
          packId,
          policy: 'one_high_span_subregion_per_natural_day',
        },
      })),
      ...forbiddenNodeIds.map((nodeId) => ({
        constraintId: `forbidden_${nodeId}`,
        kind: 'EDGE_FORBIDDEN' as const,
        hard: true,
        payload: { icelandRelation: 'GATE_REJECT', nodeId },
      })),
    ];

    // Travel matrix over attraction+support nodes only
    const matrixNodeIds = nodes.map((n) => n.nodeId);
    const costsMin = matrixNodeIds.map((from) =>
      matrixNodeIds.map((to) => {
        if (from === to) return 0;
        const a = nodeMetaById[from]?.placeId ?? 0;
        const b = nodeMetaById[to]?.placeId ?? 0;
        return travelMinutesHeuristic(a, b);
      }),
    );

    const maxActivitiesPerDay = ctx.maxActivitiesPerDay ?? 3;
    const maxServiceMinPerDay = maxActivitiesPerDay * 90;
    const dailyDrivingLimitMin =
      ctx.dailyDrivingLimitMin ?? 360;

    const overnight = mapConfirmedOvernightByDate(
      days.map((d) => d.date),
      arrange.confirmedLodgings,
    );
    const overnightStartPlaceIdByDayId: Record<string, number> = {};
    const overnightEndPlaceIdByDayId: Record<string, number> = {};
    for (const d of days) {
      const start = overnight.startByDate.get(d.date);
      const end = overnight.endByDate.get(d.date);
      if (start != null) overnightStartPlaceIdByDayId[d.dayId] = start;
      if (end != null) overnightEndPlaceIdByDayId[d.dayId] = end;
    }

    // Arrival / departure airport (or hub) as first-morning / last-evening drive anchors
    const originGateway = resolveIcelandGatewayPlaceRef(arrange.originGateway);
    const exitGateway = resolveIcelandGatewayPlaceRef(
      arrange.exitGateway,
      arrange.originGateway?.label ?? 'keflavik',
    );
    const originGatewayPlaceId = originGateway.placeId;
    const exitGatewayPlaceId = exitGateway.placeId;
    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    if (firstDay && originGatewayPlaceId != null) {
      overnightStartPlaceIdByDayId[firstDay.dayId] = originGatewayPlaceId;
    }
    if (lastDay && exitGatewayPlaceId != null) {
      overnightEndPlaceIdByDayId[lastDay.dayId] = exitGatewayPlaceId;
    }

    const problem: SolverProblem = {
      schemaId: SOLVER_PROBLEM_SCHEMA_ID,
      requestId: ctx.requestId ?? randomUUID(),
      tripId: arrange.tripId,
      planVersionId: ctx.planVersionId ?? 'pending-initial-plan-preview',
      operation: 'REROUTE',
      scope: {
        dayIds,
        dayCapacities: dayIds.map((dayId) => ({
          dayId,
          maxDriveMin: dailyDrivingLimitMin,
          maxServiceMin: maxServiceMinPerDay,
          maxActivities: maxActivitiesPerDay,
        })),
      },
      nodes,
      travelMatrix: { nodeIds: matrixNodeIds, costsMin },
      constraints,
      objectives: [
        { objectiveId: 'max_coverage_reward', kind: 'MAXIMIZE_PRESERVE_BASE', weight: 1 },
        { objectiveId: 'min_travel', kind: 'MINIMIZE_TRAVEL', weight: 0.3 },
      ],
      solverConfig: {
        maxCandidates: 3,
        timeLimitMs: 5_000,
        seed: ctx.seed ?? 42,
      },
    };

    return {
      problem,
      semantics: {
        nodeMetaById,
        parentChildHard,
        coVisitSoft,
        softAlternative,
        dayScopePackIds,
        dayIds,
        datesByDayId,
        maxActivitiesPerDay,
        maxServiceMinPerDay,
        dailyDrivingLimitMin,
        overnightStartPlaceIdByDayId,
        overnightEndPlaceIdByDayId,
        originGatewayPlaceId,
        exitGatewayPlaceId,
        writesPlanVersion: false,
      },
      arrangeInputHash,
      writesPlanVersion: false,
    };
  }
}

/** Exported for orchestrator hash reuse */
export function hashArrangeInput(arrange: InitialPlanArrangeInput): string {
  return hashArrange(arrange);
}
