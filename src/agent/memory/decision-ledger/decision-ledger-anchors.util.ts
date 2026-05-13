import type { DecisionMemory } from '../decision-memory/decision-memory.types';
import type { RouteDirectionDecisionMemory } from '../interfaces/route-direction-decision-memory.interface';
import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';
import type { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import type { RouteRunPartyProfileSnapshot } from '../interfaces/agent-memory-context.interface';
import type { LedgerAnchorsV1, LedgerEdgeV1, LedgerNode } from './decision-ledger.types';
import type { WorldTopicSlice } from './world-topic-slice.types';
import { stableDigest } from './decision-ledger-digest.util';
import {
  buildWorldAnchorV1FromSlices,
  buildWorldTopicSlicesFromTripContext,
  listStaleWorldTopicTopics,
  serializeWorldAnchorComposite,
} from './decision-ledger-world-anchor.util';

export function mergePreferenceAnchorPayload(
  userProfile: UserTravelProfile | null,
  travelPreference: Record<string, unknown> | null,
  routePartyProfile: RouteRunPartyProfileSnapshot | null,
): unknown {
  const fromProfile = userProfile
    ? {
        pacePreference: userProfile.pacePreference,
        riskTolerance: userProfile.riskTolerance,
        travelPhilosophy: userProfile.travelPhilosophy,
        preferredRouteTypes: userProfile.preferredRouteTypes,
        confidence: userProfile.confidence,
      }
    : null;
  const fromRoute =
    routePartyProfile &&
    (routePartyProfile.fitness_level != null ||
      routePartyProfile.risk_tolerance != null ||
      routePartyProfile.party_total != null ||
      routePartyProfile.has_children != null ||
      routePartyProfile.has_elderly != null ||
      (typeof routePartyProfile.mobility_note_zh === 'string' && routePartyProfile.mobility_note_zh.trim().length > 0))
      ? {
          route_fitness_level: routePartyProfile.fitness_level ?? null,
          route_risk_tolerance: routePartyProfile.risk_tolerance ?? null,
          route_party_total: routePartyProfile.party_total ?? null,
          route_has_children: routePartyProfile.has_children ?? null,
          route_has_elderly: routePartyProfile.has_elderly ?? null,
          route_mobility_note_zh: routePartyProfile.mobility_note_zh?.trim() ?? null,
        }
      : null;
  return {
    travelPreference: travelPreference ?? null,
    fromProfile,
    fromRoute,
  };
}

export function buildLedgerAnchorBundle(input: {
  activeTripState: TripTaskMemory | null;
  travelPreference: Record<string, unknown> | null;
  userProfile: UserTravelProfile | null;
  routePartyProfile: RouteRunPartyProfileSnapshot | null;
  recentWorldDecisions: DecisionMemory[];
  nowMs?: number;
}): {
  anchors: LedgerAnchorsV1;
  worldSlices: WorldTopicSlice[];
  staleWorldTopics: string[];
} {
  const now = input.nowMs ?? Date.now();
  const constraints = input.activeTripState?.constraints ?? null;
  const budgetPayload =
    constraints && typeof constraints === 'object' && 'budget' in constraints
      ? (constraints as Record<string, unknown>).budget
      : constraints;
  const budget = stableDigest(budgetPayload ?? 'ledger:budget:none');

  const preference = stableDigest(
    mergePreferenceAnchorPayload(input.userProfile, input.travelPreference, input.routePartyProfile),
  );

  const worldSlices = buildWorldTopicSlicesFromTripContext({
    recentWorldDecisions: input.recentWorldDecisions,
    activeTripState: input.activeTripState,
    nowMs: now,
  });
  const staleWorldTopics = listStaleWorldTopicTopics(worldSlices, now);
  const worldLayered = buildWorldAnchorV1FromSlices(worldSlices);
  const world = serializeWorldAnchorComposite(worldLayered);

  const policy = stableDigest({
    phase: input.activeTripState?.currentPhase ?? null,
    execution_state: input.activeTripState?.execution_state ?? null,
  });

  return {
    anchors: { budget, preference, policy, world, worldLayered },
    worldSlices,
    staleWorldTopics,
  };
}

/**
 * 从当前请求 / trip 态构造全局锚（与节点 inputSignatures 对比用）。
 */
export function buildLedgerAnchorsV1(input: {
  activeTripState: TripTaskMemory | null;
  travelPreference: Record<string, unknown> | null;
  userProfile: UserTravelProfile | null;
  routePartyProfile: RouteRunPartyProfileSnapshot | null;
  recentWorldDecisions: DecisionMemory[];
  nowMs?: number;
}): LedgerAnchorsV1 {
  return buildLedgerAnchorBundle(input).anchors;
}

/**
 * 将 L2 路线决策记忆投影为 Ledger 节点（v0：不参与 world 锚根命中，避免缺历史世界切片时全图 STALE）。
 */
export function projectRouteDirectionMemoriesToLedgerNodes(
  memories: RouteDirectionDecisionMemory[],
  anchors: LedgerAnchorsV1,
): LedgerNode[] {
  const worldAnchor = serializeWorldAnchorComposite(anchors.worldLayered);
  return memories.map(m => {
    const key = m.keyConstraints && typeof m.keyConstraints === 'object' ? m.keyConstraints : {};
    const k = key as Record<string, unknown>;
    const budgetPayload = k.budget ?? k.budget_ceiling ?? k.max_daily_spend ?? k;
    const budgetAnchor = stableDigest(budgetPayload);
    const preferenceAnchor = stableDigest({
      countryCode: m.countryCode,
      month: m.month,
      keyConstraints: m.keyConstraints ?? null,
      selectedRouteDirectionId: m.selectedRouteDirectionId,
    });
    const created =
      m.createdAt instanceof Date ? m.createdAt.getTime() : new Date(m.createdAt as unknown as string).getTime();
    const outputDigest = stableDigest({
      selectedRouteDirectionId: m.selectedRouteDirectionId,
      rejectedRouteDirectionIds: m.rejectedRouteDirectionIds,
    });
    return {
      nodeId: m.id,
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'ROUTE_DIRECTION',
      inputSignatures: {
        budgetAnchor,
        preferenceAnchor,
        worldAnchor,
      },
      outputRef: {
        kind: 'route_direction',
        payloadDigest: outputDigest,
        summary: m.explanation?.whySelected?.slice(0, 120),
      },
      status: 'STABLE',
      createdAt: Number.isFinite(created) ? created : Date.now(),
      invalidationPolicy: { world: 'none', preference: 'none', policy: 'none' },
    };
  });
}

export function buildLedgerEdgesFromNodes(nodes: LedgerNode[]): LedgerEdgeV1[] {
  const edges: LedgerEdgeV1[] = [];
  for (const n of nodes) {
    for (const p of n.parentIds) {
      edges.push({ from: p, to: n.nodeId, kind: 'parent' });
    }
    for (const c of n.consumesNodeIds) {
      edges.push({ from: c, to: n.nodeId, kind: 'consumes' });
    }
  }
  return edges;
}
