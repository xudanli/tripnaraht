/**
 * 客户端 UI 展示层 enrichment：双轨行程单 + 多模态交付 artifacts。
 */

import type { DecisionUiDisplayDto } from '../dto/route-and-run.dto';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { PlanningPhaseIntentDto } from '../dto/route-and-run.dto';
import { buildDualTrackItineraryUi, type DualTrackItineraryUi } from './dual-track-itinerary-ui.util';
import { buildDeliveryArtifactsUi, type DeliveryArtifactsUi } from './delivery-artifacts-ui.util';
import { buildBookingCartUi, type BookingCartUi } from './booking-cart-ui.util';
import { optimizeBookingCartUi, type OptimizedBookingCartUi } from './booking-cart-optimizer.util';
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

  const booking_cart: OptimizedBookingCartUi | undefined = (() => {
    const raw = buildBookingCartUi({
      tripId: input.request?.trip_id,
      flightInventorySnapshot: input.bookingPayload?.flight_inventory_snapshot,
      carRentals: input.bookingPayload?.car_rentals,
      accommodations: input.bookingPayload?.accommodations,
      accommodationNightGroups: input.bookingPayload?.accommodation_night_groups,
    });
    if (!raw) return undefined;
    return optimizeBookingCartUi(raw, resolveTripBudget(input.state));
  })();

  const emotional_context = projectEmotionalContextForClient(
    resolveEmotionalContextFromOrchestratorState(input.state),
  );
  const shared_milestone_cards = buildSharedMilestoneUiCardsFromClientProjection(emotional_context);

  return {
    ...base,
    dual_track_itinerary,
    ...(delivery_artifacts ? { delivery_artifacts } : {}),
    ...(leg_evidence_cards?.length ? { leg_evidence_cards } : {}),
    ...(poi_pitfall_cards?.length ? { poi_pitfall_cards } : {}),
    ...(booking_cart ? { booking_cart } : {}),
    ...(emotional_context ? { emotional_context } : {}),
    ...(shared_milestone_cards.length ? { shared_milestone_cards } : {}),
  };
}
