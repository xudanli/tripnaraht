/**
 * Build FE ImpactScopeView — ontology chain from plan / entity refs / events.
 * User-facing copy is FE i18n via narrative.templateKey + params (no hardcoded prose).
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import type { Rfc001DecisionCenterProblemView } from './decision-center-bridge.adapter';
import type {
  ImpactScopeArrangementView,
  ImpactScopeChainNode,
  ImpactScopeConsequenceKind,
  ImpactScopeNarrativeTemplateKey,
  ImpactScopeNarrativeView,
  ImpactScopeTriggerView,
  ImpactScopeView,
} from '../../../decision-runtime/gateway/frontend/impact-scope-view.types';
import type { TravelDecisionEvent } from '../evidence/travel-decision-event.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import {
  analyzeRoadCloseImpact,
  readBindingsFromTripMetadata,
} from '../detection/road-close-impact-analyzer';
import { resolveExcessiveDailyLoadDisplayDayIndex } from '../detection/excessive-daily-load-problem.util';
import {
  fetchPlanItemImpactDetails,
  type PlanItemImpactDetail,
} from './plan-item-impact-details.util';

export interface ImpactScopeBuildContext {
  triggerEvent?: TravelDecisionEvent;
}

function resolveRoadId(
  problem: Rfc001DecisionCenterProblemView['rfc001Problem'],
  event?: TravelDecisionEvent,
): string | undefined {
  const payload = (event as RoadStatusChangedEvent | undefined)?.payload;
  if (payload?.roadId) return payload.roadId.toUpperCase();
  const roadRef = problem.affectedEntityRefs.find(
    (r) => r.kind === 'ROUTE_SEGMENT' && r.id.startsWith('road:'),
  );
  if (roadRef?.label) return roadRef.label;
  if (roadRef?.id) return roadRef.id.replace(/^road:/i, '').toUpperCase();
  return undefined;
}

function resolveRouteSegmentLabel(
  problem: Rfc001DecisionCenterProblemView['rfc001Problem'],
  roadId?: string,
): string | undefined {
  const segmentRef = problem.affectedEntityRefs.find(
    (r) => r.kind === 'ROUTE_SEGMENT' && !r.id.startsWith('road:'),
  );
  if (segmentRef?.label) return segmentRef.label;
  if (roadId) return roadId;
  const roadRef = problem.affectedEntityRefs.find((r) => r.kind === 'ROUTE_SEGMENT');
  return roadRef?.label ?? roadRef?.id?.replace(/^road:/i, '');
}

function buildTriggerView(
  view: Rfc001DecisionCenterProblemView,
  event?: TravelDecisionEvent,
): ImpactScopeTriggerView {
  const capability = view.rfc001Problem.semanticCapability ?? view.rfc001Problem.type;
  const roadId = resolveRoadId(view.rfc001Problem, event);
  const roadStatus = (event as RoadStatusChangedEvent | undefined)?.payload?.status;

  if (capability === 'WEATHER_ACTIVITY_PROHIBITED') {
    const payload = event?.payload as { regionId?: string; severity?: string } | undefined;
    return {
      capability,
      subjectKind: 'WEATHER',
      subjectId: payload?.regionId,
      status: payload?.severity,
    };
  }
  if (capability === 'EXCESSIVE_DAILY_LOAD' || view.rfc001Problem.type === 'EXCESSIVE_LOAD') {
    return {
      capability: 'EXCESSIVE_DAILY_LOAD',
      subjectKind: 'DAY_LOAD',
      dayIndex: resolveExcessiveDailyLoadDisplayDayIndex(view.rfc001Problem),
    };
  }
  if (
    capability === 'ROAD_SEGMENT_UNAVAILABLE' ||
    view.rfc001Problem.type === 'FEASIBILITY_FAILURE'
  ) {
    return {
      capability: 'ROAD_SEGMENT_UNAVAILABLE',
      subjectKind: 'ROAD',
      subjectId: roadId,
      status: roadStatus,
    };
  }
  return {
    capability,
    subjectKind: 'UNKNOWN',
  };
}

function resolveNarrativeTemplateKey(
  trigger: ImpactScopeTriggerView,
  arrangementCount: number,
): ImpactScopeNarrativeTemplateKey {
  if (trigger.capability === 'ROAD_SEGMENT_UNAVAILABLE') {
    return arrangementCount > 0
      ? 'impact.road_close.affects_arrangements'
      : 'impact.road_close.affects_day';
  }
  if (trigger.capability === 'WEATHER_ACTIVITY_PROHIBITED') {
    return arrangementCount > 0
      ? 'impact.weather.affects_outdoor'
      : 'impact.weather.affects_day';
  }
  if (trigger.capability === 'EXCESSIVE_DAILY_LOAD') {
    return arrangementCount > 0
      ? 'impact.daily_load.affects_arrangements'
      : 'impact.daily_load.adjust_pace';
  }
  return arrangementCount > 0
    ? 'impact.generic.affects_arrangements'
    : 'impact.generic.affects_day';
}

function buildNarrative(
  trigger: ImpactScopeTriggerView,
  arrangements: ImpactScopeArrangementView[],
  affectedDayIndexes: number[],
  primaryDayIndex?: number,
): ImpactScopeNarrativeView {
  const directCount = arrangements.filter((a) => a.isDirect).length;
  const downstreamCount = arrangements.length - directCount;
  const dayIndexes =
    primaryDayIndex != null ? [primaryDayIndex] : affectedDayIndexes;
  return {
    templateKey: resolveNarrativeTemplateKey(trigger, arrangements.length),
    params: {
      capability: trigger.capability,
      subjectKind: trigger.subjectKind,
      subjectId: trigger.subjectId,
      status: trigger.status,
      dayIndexes,
      primaryDayIndex,
      overloadedDayIndex: primaryDayIndex,
      arrangementLabels: arrangements.map((a) => a.label),
      arrangementCount: arrangements.length,
      directCount,
      downstreamCount,
    },
  };
}

function buildChain(
  trigger: ImpactScopeTriggerView,
  details: PlanItemImpactDetail[],
  directIds: Set<string>,
  routeLabel?: string,
): ImpactScopeChainNode[] {
  const chain: ImpactScopeChainNode[] = [
    {
      kind: 'TRIGGER',
      id: 'trigger',
      label: trigger.subjectId,
      entityRefKind: trigger.subjectKind,
    },
  ];

  if (routeLabel) {
    chain.push({
      kind: 'ROUTE',
      id: 'route',
      label: routeLabel,
      relationship: 'BELONGS_TO',
      entityRefKind: 'ROUTE_SEGMENT',
    });
  }

  const sorted = [...details].sort((a, b) => a.dayIndex - b.dayIndex);
  for (const detail of sorted) {
    const isDirect = directIds.has(detail.itemId);
    chain.push({
      kind: isDirect ? 'PLAN_ITEM' : 'DOWNSTREAM',
      id: detail.itemId,
      label: detail.label,
      dayIndex: detail.dayIndex,
      relationship: isDirect ? 'REFERENCES' : 'DELAYS',
      entityRefKind: 'PLAN_ITEM',
    });
  }

  let consequenceKind: ImpactScopeConsequenceKind | undefined;
  if (trigger.capability === 'EXCESSIVE_DAILY_LOAD') {
    consequenceKind = 'DAILY_DRIVING_LOAD';
  } else if (
    sorted.some((d) => d.arrangementKind === 'HOTEL' || d.arrangementKind === 'MEAL')
  ) {
    consequenceKind = 'CHECKIN_AND_RESERVATION_TIMING';
  }

  if (consequenceKind) {
    chain.push({
      kind: 'CONSEQUENCE',
      id: `consequence_${consequenceKind.toLowerCase()}`,
      consequenceKind,
      dayIndex: trigger.dayIndex ?? sorted[0]?.dayIndex,
      relationship: 'AFFECTS',
    });
  }

  return chain;
}

function toArrangements(
  details: PlanItemImpactDetail[],
  directIds: Set<string>,
  capability: string,
): ImpactScopeArrangementView[] {
  const impactType =
    capability === 'EXCESSIVE_DAILY_LOAD'
      ? ('AT_RISK' as const)
      : ('BLOCKED' as const);

  return details.map((d) => ({
    itemId: d.itemId,
    label: d.label,
    dayIndex: d.dayIndex,
    arrangementKind: d.arrangementKind,
    impactType,
    isDirect: directIds.has(d.itemId),
    hasBooking: d.hasBooking,
    placeId: d.placeId,
  }));
}

export function buildImpactScopeView(
  view: Rfc001DecisionCenterProblemView,
  details: PlanItemImpactDetail[],
  ctx: ImpactScopeBuildContext = {},
  opts: { directItemIds?: string[]; routeLabel?: string } = {},
): ImpactScopeView | undefined {
  const itemIds = view.rfc001Problem.affectedPlanItemIds;
  if (!itemIds.length && !details.length) return undefined;

  const trigger = buildTriggerView(view, ctx.triggerEvent);
  const directIds = new Set(
    opts.directItemIds?.length
      ? opts.directItemIds
      : details.filter((d) => d.arrangementKind === 'DRIVE').map((d) => d.itemId),
  );
  const arrangements = toArrangements(details, directIds, trigger.capability);
  const displayLoadDay =
    trigger.capability === 'EXCESSIVE_DAILY_LOAD'
      ? resolveExcessiveDailyLoadDisplayDayIndex(view.rfc001Problem)
      : undefined;
  const scopedArrangements =
    displayLoadDay != null
      ? arrangements.filter((a) => a.dayIndex === displayLoadDay)
      : arrangements;
  const effectiveArrangements =
    scopedArrangements.length > 0 ? scopedArrangements : arrangements;
  const affectedDayIndexes =
    displayLoadDay != null
      ? [displayLoadDay]
      : [
          ...new Set(
            effectiveArrangements.map((a) => a.dayIndex).filter((d) => d > 0),
          ),
        ].sort((a, b) => a - b);

  const roadId = trigger.subjectId;
  const routeLabel =
    opts.routeLabel ??
    (trigger.capability === 'ROAD_SEGMENT_UNAVAILABLE'
      ? resolveRouteSegmentLabel(view.rfc001Problem, roadId)
      : undefined);

  const chain = buildChain(trigger, details, directIds, routeLabel);
  const narrative = buildNarrative(
    trigger,
    effectiveArrangements,
    affectedDayIndexes,
    displayLoadDay ?? affectedDayIndexes[0],
  );

  return {
    schemaId: 'tripnara.impact_scope@v1',
    trigger,
    chain,
    arrangements: effectiveArrangements,
    affectedDayIndexes,
    narrative,
  };
}

export async function buildImpactScopeViewForProblem(
  prisma: PrismaService,
  view: Rfc001DecisionCenterProblemView,
  ctx: ImpactScopeBuildContext = {},
): Promise<ImpactScopeView | undefined> {
  const itemIds = view.rfc001Problem.affectedPlanItemIds;
  if (!itemIds.length) return undefined;

  const details = await fetchPlanItemImpactDetails(prisma, itemIds);
  const capability = view.rfc001Problem.semanticCapability;

  if (
    capability === 'ROAD_SEGMENT_UNAVAILABLE' ||
    view.rfc001Problem.type === 'FEASIBILITY_FAILURE'
  ) {
    const roadId = resolveRoadId(view.rfc001Problem, ctx.triggerEvent);
    if (roadId) {
      const [plan, trip] = await Promise.all([
        synthesizeRoutePlanDraftFromTrip(prisma, view.tripId),
        prisma.trip.findUnique({
          where: { id: view.tripId },
          select: { metadata: true },
        }),
      ]);
      if (plan) {
        const impact = analyzeRoadCloseImpact(plan, {
          tripId: view.tripId,
          roadId,
          bindings: readBindingsFromTripMetadata(trip?.metadata),
        });
        const directFromDrive = details
          .filter(
            (d) =>
              impact.affectedPlanItemIds.includes(d.itemId) &&
              !impact.downstreamItemIds.includes(d.itemId),
          )
          .map((d) => d.itemId);
        const directItemIds =
          directFromDrive.length > 0
            ? directFromDrive
            : impact.affectedPlanItemIds.filter(
                (id) => !impact.downstreamItemIds.includes(id),
              );

        return buildImpactScopeView(view, details, ctx, {
          directItemIds,
          routeLabel: resolveRouteSegmentLabel(view.rfc001Problem, roadId),
        });
      }
    }
  }

  return buildImpactScopeView(view, details, ctx);
}
