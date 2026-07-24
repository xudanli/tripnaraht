/**
 * 客户端 UI 展示层 enrichment：双轨行程单 + 多模态交付 artifacts。
 */

import type { DecisionUiDisplayDto } from '../dto/route-and-run.dto';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { PlanningPhaseIntentDto } from '../dto/route-and-run.dto';
import { buildDualTrackItineraryUi, type DualTrackItineraryUi } from './dual-track-itinerary-ui.util';
import { buildDeliveryArtifactsUi } from './delivery-artifacts-ui.util';
import { buildBookingCartUi } from './booking-cart-ui.util';
import {
  cartOptimizationItemsFromUi,
  optimizeBookingCartUi,
  type BookingCartGlobalPreferences,
  type OptimizedBookingCartUi,
} from './booking-cart-optimizer.util';
import { buildBookingPriorityList } from '../delivery/utils/booking-priority-list.builder.util';
import type { BookingPriorityList } from '../delivery/types/booking-priority-list.type';
import { buildUnifiedMapLayer } from '../delivery/utils/unified-map-layer.builder.util';
import type { UnifiedMapLayerPayload } from '../delivery/types/unified-map-layer.type';
import type { LegEvidenceCard } from './narrate-leg-evidence.util';
import { buildLegEvidenceCards } from './narrate-leg-evidence.util';
import type { PoiPitfallCard } from './poi-pitfall-insight.util';
import { buildPoiPitfallCards } from './poi-pitfall-insight.util';
import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { RobustnessDashboardPayload } from './robustness-rollout-gateway.util';
import type { PlanningIntentPayload } from './planning-intent-processor.util';
import {
  projectEmotionalContextForClient,
  resolveEmotionalContextFromOrchestratorState,
} from '../narrator/emotional-context-client-projection.util';
import { buildSharedMilestoneUiCardsFromClientProjection } from '../narrator/shared-milestone-ui.util';
import { collectTravelDiagnostic } from '../narrator/utils/travel-diagnostic-collector.util';
import { buildVoicePayloadForDiagnostic } from '../narrator/services/voice-evidence-translator.util';
import type { EmotionalVoiceToneModifier } from '../narrator/types/emotional-context.type';
import { buildAccommodationHealthUi } from './accommodation-health-ui.util';
import type { VoicePayload } from '../narrator/services/voice-evidence-translator.util';
import type { AccommodationHealthUi } from './accommodation-health-ui.util';
import { buildOpenWorldDiscoveryUi } from '../delivery/utils/open-world-discovery-ui.builder.util';
import type { OpenWorldDiscoveryUi } from '../delivery/utils/open-world-discovery-ui.builder.util';
import { buildDecisionContextSliceFromOrchestrator } from '../../planning-policy/open-world/decision-context-sync.util';

export interface ClientUiEnrichmentInput {
  existingUiDisplay?: DecisionUiDisplayDto | null;
  state?: OrchestratorState | null;
  itinerary?: Itinerary | null;
  request?: RouteAndRunRequestDto | null;
  robustnessDashboard?: RobustnessDashboardPayload | null;
  /** result.status === 'OK' */
  resultOk?: boolean;
  /** NARRATE 已产出的 leg 证据（优先于现场重建） */
  narration?: NarrationLike | null;
  /** route_and_run payload 预订快照（航班/酒店/租车） */
  bookingPayload?: {
    flight_inventory_snapshot?: Record<string, unknown> | null;
    car_rentals?: unknown[] | null;
    accommodations?: unknown[] | null;
    accommodation_night_groups?: unknown[] | null;
  } | null;
}

function resolvePlanningPhaseIntent(
  state?: OrchestratorState | null,
): PlanningIntentPayload | PlanningPhaseIntentDto | null {
  const raw = (state?.metadata as Record<string, unknown> | undefined)?.planning_phase_intent;
  if (!raw || typeof raw !== 'object') return null;
  return raw as PlanningIntentPayload;
}

function resolveRegretUpperBound(state?: OrchestratorState | null): number | undefined {
  const intent = resolvePlanningPhaseIntent(state);
  const party = (intent as PlanningIntentPayload | null)?.party_negotiation;
  return typeof party?.regret_upper_bound === 'number' ? party.regret_upper_bound : undefined;
}

function resolveLuxuryAnchorNights(state?: OrchestratorState | null): number[] | undefined {
  const intent = resolvePlanningPhaseIntent(state) as
    | { highlight_nights?: number[]; luxury_anchor_nights?: number[] }
    | null;
  const nights = intent?.luxury_anchor_nights ?? intent?.highlight_nights;
  if (!Array.isArray(nights) || !nights.length) return undefined;
  return nights.filter((n) => typeof n === 'number' && Number.isFinite(n));
}

function resolveBookingCartGlobalPreferences(
  state?: OrchestratorState | null,
  rawCartItems?: ReturnType<typeof buildBookingCartUi>,
): BookingCartGlobalPreferences {
  const luxuryAnchorNightIndices = resolveLuxuryAnchorNights(state);
  const preferFromRequest = Boolean(
    (state?.trip_plan_request as { constraints?: { prefer_highlight_anchor?: boolean } } | undefined)
      ?.constraints?.prefer_highlight_anchor,
  );
  const hasLuxuryInCart =
    rawCartItems != null &&
    cartOptimizationItemsFromUi(rawCartItems.items, { luxuryAnchorNightIndices }).some(
      (i) => i.isLuxuryAnchor,
    );

  return {
    preferHighlightAnchor: preferFromRequest || hasLuxuryInCart || Boolean(luxuryAnchorNightIndices?.length),
    ...(luxuryAnchorNightIndices?.length ? { luxuryAnchorNightIndices } : {}),
  };
}

function resolveTripBudget(
  state?: OrchestratorState | null,
): { total: number; currency?: string } | undefined {
  const tpr = state?.trip_plan_request as
    | {
        constraints?: { budget?: { total?: number; currency?: string } };
        ontology_context?: { user?: { budget_cap?: number } };
      }
    | undefined;
  const fromConstraints = tpr?.constraints?.budget?.total;
  const fromOntology = tpr?.ontology_context?.user?.budget_cap;
  const total =
    typeof fromConstraints === 'number' && fromConstraints > 0
      ? fromConstraints
      : typeof fromOntology === 'number' && fromOntology > 0
        ? fromOntology
        : undefined;
  if (total == null) return undefined;
  const currency = tpr?.constraints?.budget?.currency;
  return { total, ...(currency?.trim() ? { currency: currency.trim() } : {}) };
}

export function enrichClientUiDisplay(input: ClientUiEnrichmentInput): DecisionUiDisplayDto {
  const base = input.existingUiDisplay ?? {};
  const planningPhaseIntent = resolvePlanningPhaseIntent(input.state);
  const regretUpperBound = resolveRegretUpperBound(input.state);

  const dual_track_itinerary: DualTrackItineraryUi = buildDualTrackItineraryUi({
    itinerary: input.itinerary,
    planningPhaseIntent,
    robustnessDashboard: input.robustnessDashboard,
    regretUpperBound,
  });

  const delivery_artifacts = buildDeliveryArtifactsUi({
    itinerary: input.itinerary,
    tripId: input.request?.trip_id,
    userId: input.request?.user_id,
    include: input.resultOk !== false && Boolean(input.itinerary?.days?.length),
  });

  const leg_evidence_cards: LegEvidenceCard[] | undefined = (() => {
    if (input.narration?.leg_evidence_cards?.length) {
      return input.narration.leg_evidence_cards as LegEvidenceCard[];
    }
    if (!input.itinerary?.days?.length) return undefined;
    const party = (input.state?.trip_plan_request as { party?: { has_elderly?: boolean } } | undefined)
      ?.party;
    const explainLogs = (input.itinerary.metadata as Record<string, unknown> | undefined)
      ?.explain_logs as string[] | undefined;
    const built = buildLegEvidenceCards(input.itinerary, {
      hasElderly: party?.has_elderly === true,
      explainLogs: Array.isArray(explainLogs) ? explainLogs : undefined,
    });
    return built.length ? built : undefined;
  })();

  const poi_pitfall_cards: PoiPitfallCard[] | undefined = (() => {
    if (input.narration?.poi_pitfall_cards?.length) {
      return input.narration.poi_pitfall_cards as PoiPitfallCard[];
    }
    if (!input.itinerary?.days?.length) return undefined;
    const built = buildPoiPitfallCards(input.itinerary);
    return built.length ? built : undefined;
  })();

  const booking_priority_list: BookingPriorityList | undefined = (() => {
    const tripId = input.request?.trip_id?.trim();
    if (!tripId) return undefined;
    const researchData = (input.state?.research_data ?? input.state?.metadata) as
      | Record<string, unknown>
      | undefined;
    return buildBookingPriorityList({
      tripId,
      itinerary: input.itinerary,
      researchData,
      poiPitfallCards: poi_pitfall_cards,
    });
  })();

  const unified_map_layer: UnifiedMapLayerPayload | undefined = buildUnifiedMapLayer({
    itinerary: input.itinerary,
    tripId: input.request?.trip_id,
    bookingPayload: input.bookingPayload,
  });

  const booking_cart: OptimizedBookingCartUi | undefined = (() => {
    const raw = buildBookingCartUi({
      tripId: input.request?.trip_id,
      flightInventorySnapshot: input.bookingPayload?.flight_inventory_snapshot,
      carRentals: input.bookingPayload?.car_rentals,
      accommodations: input.bookingPayload?.accommodations,
      accommodationNightGroups: input.bookingPayload?.accommodation_night_groups,
    });
    if (!raw) return undefined;
    const globalPreferences = resolveBookingCartGlobalPreferences(input.state, raw);
    return optimizeBookingCartUi(raw, {
      budget: resolveTripBudget(input.state),
      globalPreferences,
      useGlobalOptimization: globalPreferences.preferHighlightAnchor !== false,
    });
  })();

  const emotional_context = projectEmotionalContextForClient(
    resolveEmotionalContextFromOrchestratorState(input.state),
  );
  const shared_milestone_cards = buildSharedMilestoneUiCardsFromClientProjection(emotional_context);

  const travelDiagnostic = collectTravelDiagnostic({
    itinerary: input.itinerary,
    accommodations: input.bookingPayload?.accommodations,
    accommodationNightGroups: input.bookingPayload?.accommodation_night_groups,
    gateViolations: (
      input.state?.gate_result as { violations?: Array<{ type?: string; detail?: string }> } | undefined
    )?.violations,
    selfHealApplied: (input.state?.decision_log ?? []).some((entry) => {
      const code = String((entry as { reason_code?: string }).reason_code ?? '');
      return /REPAIR|SELF_HEAL|HEAL|REROUTE/i.test(code);
    }),
  });

  const accommodation_health: AccommodationHealthUi | undefined = buildAccommodationHealthUi(travelDiagnostic);

  const open_world_discovery: OpenWorldDiscoveryUi | undefined = (() => {
    const md = input.state?.metadata as Record<string, unknown> | undefined;
    const rd = input.state?.research_data as Record<string, unknown> | undefined;
    const discovery = (md?.open_world_discovery ?? rd?.open_world_discovery) as
      | import('../../planning-policy/types/open-world-poi.types').OpenWorldDiscoveryResult
      | undefined;
    const decisionContext = buildDecisionContextSliceFromOrchestrator(input.state ?? ({} as OrchestratorState));
    return buildOpenWorldDiscoveryUi({ discovery, decisionContext });
  })();

  const voice_payload = (
    input.narration?.voice_payload ??
    buildVoicePayloadForDiagnostic(
      travelDiagnostic,
      (emotional_context?.voiceToneModifier ?? 'empathetic_reassurance') as EmotionalVoiceToneModifier,
    )
  ) as VoicePayload | undefined;

  return {
    ...base,
    dual_track_itinerary,
    ...(delivery_artifacts ? { delivery_artifacts } : {}),
    ...(leg_evidence_cards?.length ? { leg_evidence_cards } : {}),
    ...(poi_pitfall_cards?.length ? { poi_pitfall_cards } : {}),
    ...(booking_priority_list ? { booking_priority_list } : {}),
    ...(unified_map_layer ? { unified_map_layer } : {}),
    ...(booking_cart ? { booking_cart } : {}),
    ...(emotional_context ? { emotional_context } : {}),
    ...(shared_milestone_cards.length ? { shared_milestone_cards } : {}),
    ...(accommodation_health ? { accommodation_health } : {}),
    ...(open_world_discovery ? { open_world_discovery } : {}),
    ...(voice_payload ? { voice_payload } : {}),
  };
}
