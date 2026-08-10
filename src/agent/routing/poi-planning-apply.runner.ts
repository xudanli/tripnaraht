/**
 * POI Planning：研究 POI 标注 / 锚点 stub / STATE_UPDATE patch（从 ClaudeOrchestrator 迁出）。
 */

import type { PoiPlanningApplyHost } from './poi-planning-apply.host';
import type { DecisionState, DecisionStatePatch } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { UserRouteIntent } from '../../planning-policy/interfaces/region-intent.types';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../planning-policy/regions/iceland-poi-slugs';
import { POI_PLANNING_SCORE_REASON } from '../../planning-policy/constants/poi-planning-score-reasons';
import { poiPlanningRowIdentityKey } from '../../planning-policy/utils/poi-planning-anchor-admission.util';
import {
  goldenCircleEntityStrongMatch,
  keywordMatchResearchPoiToSlug,
  researchPoiHasStableId,
} from '../../planning-policy/utils/anchor-entity-match.util';
import {
  buildCorridorAdjustPoiPlanningSlice,
  shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning,
} from '../utils/itinerary-adjust-poi-planning.util';

export function applyPoiPlanningToResearchPois(
  pois: any[],
  decisionState: DecisionState | undefined,
  destinationCountry: string | undefined,
): { pois: any[]; excludedFilteredCount: number } {
  const slice = decisionState?.poiPlanning;
  if (!slice?.poiPlan || destinationCountry !== 'IS') {
    return { pois, excludedFilteredCount: 0 };
  }
  let out = [...pois];
  let excludedFilteredCount = 0;
  for (const slug of slice.poiPlan.excludedPoiIds ?? []) {
    const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
    if (!kws?.length) continue;
    out = out.filter((p) => {
      const n = `${p?.name ?? ''} ${p?.nameCN ?? ''}`.toLowerCase();
      const drop = kws.some((k) => n.includes(k.toLowerCase()));
      if (drop) excludedFilteredCount++;
      return !drop;
    });
  }
  const matchedSlugs = new Set<string>();
  const usedPoiKeys = new Set<string>();
  const regionId = slice.routeIntent?.regionId;
  for (const slug of slice.poiPlan.requiredAnchorPoiIds ?? []) {
    const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
    if (!kws?.length) continue;
    const pool = out.filter((p) => {
      const k = poiPlanningRowIdentityKey(p);
      return k && !usedPoiKeys.has(k);
    });
    const found: any =
      pool.find(
        (p) =>
          researchPoiHasStableId(p) &&
          regionId === 'golden_circle' &&
          goldenCircleEntityStrongMatch(p, slug),
      ) ?? pool.find((p) => keywordMatchResearchPoiToSlug(p, slug));
    if (found) {
      const isRetrieved =
        researchPoiHasStableId(found) &&
        regionId === 'golden_circle' &&
        goldenCircleEntityStrongMatch(found, slug);
      found.poi_planning_anchor_slug = slug;
      found.poi_planning_anchor_source = isRetrieved ? 'retrieved' : 'matched_existing';
      found.source = found.source ?? 'poi_planning_matched_existing';
      found.poi_planning_admission_protected = true;
      found.poi_planning_score_reasons = [
        ...(found.poi_planning_score_reasons ?? []),
        POI_PLANNING_SCORE_REASON.ANCHOR_MATCHED_EXISTING,
        POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
      ];
      matchedSlugs.add(slug);
      const pk = poiPlanningRowIdentityKey(found);
      if (pk) usedPoiKeys.add(pk);
    }
  }
  const signatures = new Set(
    out.map((p) => `${p?.name ?? ''} ${p?.nameCN ?? ''}`.toLowerCase()),
  );
  for (const slug of slice.poiPlan.requiredAnchorPoiIds ?? []) {
    if (matchedSlugs.has(slug)) continue;
    const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
    if (!kws?.length) continue;
    const primary = kws[0];
    const stub = {
      name: primary,
      nameCN: primary,
      category: 'ATTRACTION',
      poi_planning_anchor_slug: slug,
      source: 'poi_planning_fallback',
      poi_planning_anchor_source: 'fallback',
      poi_planning_admission_protected: true,
      poi_planning_score_reasons: [
        POI_PLANNING_SCORE_REASON.ANCHOR_FALLBACK_PLACEHOLDER,
        POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
      ],
    };
    out.unshift(stub);
    signatures.add(primary.toLowerCase());
  }
  return { pois: out, excludedFilteredCount };
}

/** Phase 2.6：enforce 阶段与 merge 占位符同形，保证 passesHardPoiGuards（IS） */
export function buildPoiPlanningAnchorFallbackStub(slug: string): Record<string, unknown> {
  const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
  const primary = kws?.[0] ?? slug;
  return {
    name: primary,
    nameCN: primary,
    category: 'ATTRACTION',
    poi_planning_anchor_slug: slug,
    source: 'poi_planning_fallback',
    poi_planning_anchor_source: 'fallback',
    poi_planning_admission_protected: true,
    poi_planning_score_reasons: [
      POI_PLANNING_SCORE_REASON.ANCHOR_FALLBACK_PLACEHOLDER,
      POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
    ],
  };
}

export function applyPoiPlanningToPatch(
  host: PoiPlanningApplyHost,
  patch: DecisionStatePatch,
  decisionState: DecisionState,
  state: OrchestratorState,
): void {
  if (!host.regionAnchorPlanning) return;
  const ui = patch.userIntent ?? decisionState.userIntent;
  if (!ui) return;
  const q = (state.metadata as { intake_user_message?: string }).intake_user_message;
  const routePrimary = (state.metadata as Record<string, unknown>)?.route_and_run_intent as
    | { primary?: string }
    | undefined;
  const isItineraryAdjust = routePrimary?.primary === 'ITINERARY_ADJUST';

  if (
    isItineraryAdjust &&
    shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning(typeof q === 'string' ? q : undefined, (text) => {
      const hit = host.regionAnchorPlanning!.resolveAndBuildSlice({}, text);
      return {
        regionIntent: hit?.routeIntent?.regionId
          ? { regionId: hit.routeIntent.regionId }
          : undefined,
        confidence: hit?.routeIntent?.confidence ?? 0,
      };
    })
  ) {
    const slice = buildCorridorAdjustPoiPlanningSlice({
      totalBudgetMinutes: ui.totalBudgetMinutes,
    });
    patch.poiPlanning = slice;
    const meta = state.metadata as Record<string, unknown>;
    meta.poiPlanningFeasibility = slice.schedulePlan?.feasibility;
    meta.poiPlanningBudgetGateApplied = false;
    meta.poiPlanningResolution = slice.resolution;
    host.logger.debug(
      `[STATE_UPDATE] poiPlanning corridor_adjust anchors=0 excluded=${slice.poiPlan?.excludedPoiIds?.length ?? 0}`,
    );
    return;
  }

  const userRoute: Partial<UserRouteIntent> = {
    regionId: isItineraryAdjust ? undefined : ui.regionId,
    mustIncludePoiIds: ui.mustIncludePoiIds,
    excludePoiIds: ui.excludePoiIds,
    totalBudgetMinutes: ui.totalBudgetMinutes,
    pace: ui.pace,
    styleTags: ui.styleTags,
    availableStartTime: ui.availableStartTime,
    availableEndTime: ui.availableEndTime,
  };
  const slice = host.regionAnchorPlanning.resolveAndBuildSlice(userRoute, q);
  if (slice) {
    patch.poiPlanning = slice;
    const meta = state.metadata as Record<string, unknown>;
    meta.poiPlanningFeasibility = slice.schedulePlan?.feasibility;
    meta.poiPlanningBudgetGateApplied = slice.budgetGateApplied === true;
    meta.poiPlanningResolution = slice.resolution;
    host.logger.debug(
      `[STATE_UPDATE] poiPlanning region=${slice.routeIntent?.regionId ?? 'n/a'} anchors=${slice.poiPlan?.requiredAnchorPoiIds?.join(',') ?? ''} budgetGate=${slice.budgetGateApplied}`,
    );
  }
}
