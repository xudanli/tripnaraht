import {
  assembleConversationTurnResult,
  buildAssembleInputFromPayloadFragments,
} from './conversation-card-assembler';
import type { TripConversationContextSnapshotV1 } from './conversation-turn-result.types';
import type { RouteAndRunResponseDto } from '../../dto/route-and-run.dto';
import type { CgusTripReviewRefV1 } from '../project-cgus-trip-review-ref.util';

/**
 * 双写：在已有 payload 上附加 conversation_turn_result（不删除旧字段）。
 */
export function attachConversationTurnResultToPayload(params: {
  request_id: string;
  trip_id?: string | null;
  answer_text: string;
  result_status?: string | null;
  payload: Record<string, unknown>;
  trusted_delivery_v1?: {
    delivery_verdict?: string;
    user_confirm?: { required?: boolean };
    flawed_disclosure?: { present?: boolean };
    ai_operation_log?: Array<{ label_zh?: string; summary?: string }>;
  } | null;
  context?: TripConversationContextSnapshotV1 | null;
  traveling_execution_focus?: boolean;
  import_intent_hint?: boolean;
  guide_to_plan_session?: {
    session_id?: string;
    summary_zh?: string;
    status?: 'stub' | 'parsed' | 'matched' | 'conflict' | 'ready_to_write';
    matched_day_iso?: string;
    conflicts_zh?: string[];
    missing_zh?: string[];
  } | null;
  notify_member_ids?: string[];
  /** CGUS Outcome Loop 回写指针 */
  cgus_trip_review?: CgusTripReviewRefV1 | null;
}): Record<string, unknown> {
  const input = buildAssembleInputFromPayloadFragments({
    request_id: params.request_id,
    trip_id: params.trip_id,
    answer_text: params.answer_text,
    result_status: params.result_status,
    payload: params.payload,
    trusted_delivery_v1: params.trusted_delivery_v1,
    context: params.context,
    traveling_execution_focus: params.traveling_execution_focus,
    import_intent_hint: params.import_intent_hint,
    guide_to_plan_session: params.guide_to_plan_session,
    notify_member_ids: params.notify_member_ids,
  });
  const turn = assembleConversationTurnResult(input);
  const p = params.payload;
  const accommodationCards = Array.isArray(p.accommodation_cards)
    ? (p.accommodation_cards as Array<Record<string, unknown>>)
    : Array.isArray(p.accommodations)
      ? (p.accommodations as Array<Record<string, unknown>>)
      : undefined;
  const activityBookingCards = Array.isArray(p.activity_booking_cards)
    ? (p.activity_booking_cards as Array<Record<string, unknown>>)
    : Array.isArray(p.activities)
      ? (p.activities as Array<Record<string, unknown>>)
      : undefined;
  const carRentalCards = Array.isArray(p.car_rental_cards)
    ? (p.car_rental_cards as Array<Record<string, unknown>>)
    : Array.isArray(p.car_rentals)
      ? (p.car_rentals as Array<Record<string, unknown>>)
      : undefined;
  const flightCards = Array.isArray(p.flight_cards)
    ? (p.flight_cards as Array<Record<string, unknown>>)
    : undefined;
  const xhsNoteCards = Array.isArray(p.xhs_note_cards)
    ? (p.xhs_note_cards as Array<Record<string, unknown>>)
    : undefined;
  const hotelInventory =
    accommodationCards && accommodationCards.length > 0
      ? {
          accommodation_cards: accommodationCards,
          ...(Array.isArray(p.accommodations)
            ? { accommodations: p.accommodations as Array<Record<string, unknown>> }
            : {}),
          ...(Array.isArray(p.accommodation_night_groups)
            ? {
                accommodation_night_groups: p.accommodation_night_groups as Array<
                  Record<string, unknown>
                >,
              }
            : {}),
          ...(p.hotel_search_meta && typeof p.hotel_search_meta === 'object'
            ? { hotel_search_meta: p.hotel_search_meta as Record<string, unknown> }
            : {}),
          ui_surface: 'accommodation_cards',
        }
      : {};
  const activityInventory =
    activityBookingCards && activityBookingCards.length > 0
      ? {
          activity_booking_cards: activityBookingCards,
          ...(Array.isArray(p.activities)
            ? { activities: p.activities as Array<Record<string, unknown>> }
            : {}),
          ...(p.activity_search_meta && typeof p.activity_search_meta === 'object'
            ? { activity_search_meta: p.activity_search_meta as Record<string, unknown> }
            : {}),
        }
      : {};
  const carRentalInventory =
    carRentalCards && carRentalCards.length > 0
      ? {
          car_rental_cards: carRentalCards,
          car_rentals: carRentalCards,
          ...(p.car_rental_search_meta && typeof p.car_rental_search_meta === 'object'
            ? { car_rental_search_meta: p.car_rental_search_meta as Record<string, unknown> }
            : {}),
          ...(Array.isArray(p.car_rental_guidance_footnotes_zh)
            ? {
                car_rental_guidance_footnotes_zh: p.car_rental_guidance_footnotes_zh as string[],
              }
            : {}),
          /** 渠道渲染提示；不覆盖信封 schema_id（仍为 conversation_turn_result@v1） */
          ui_surface: 'car_rental_cards',
        }
      : {};
  const flightInventory =
    flightCards && flightCards.length > 0
      ? {
          flight_cards: flightCards,
          ...(p.flight_inventory_snapshot && typeof p.flight_inventory_snapshot === 'object'
            ? {
                flight_inventory_snapshot: p.flight_inventory_snapshot as Record<
                  string,
                  unknown
                >,
              }
            : {}),
          ui_surface: 'flight_cards',
        }
      : {};
  const xhsInventory =
    xhsNoteCards && xhsNoteCards.length > 0
      ? {
          xhs_note_cards: xhsNoteCards,
          ...(p.xhs_search_meta && typeof p.xhs_search_meta === 'object'
            ? { xhs_search_meta: p.xhs_search_meta as Record<string, unknown> }
            : {}),
          ui_surface: 'xhs_note_cards',
        }
      : {};
  const turnOut = {
    ...turn,
    ...hotelInventory,
    ...activityInventory,
    ...carRentalInventory,
    ...flightInventory,
    ...xhsInventory,
    ...(params.cgus_trip_review ? { cgus_trip_review: params.cgus_trip_review } : {}),
  };
  return {
    ...params.payload,
    conversation_turn_result: turnOut,
    ...(params.cgus_trip_review ? { cgus_trip_review_v1: params.cgus_trip_review } : {}),
    ...(params.context
      ? { trip_conversation_context: params.context }
      : turnOut.context
        ? { trip_conversation_context: turnOut.context }
        : {}),
  };
}

/** 轻量快路径：给完整 response 双写 conversation_turn_result */
export function attachConversationTurnToRouteAndRunResponse(
  response: RouteAndRunResponseDto,
  opts?: {
    context?: TripConversationContextSnapshotV1 | null;
    import_intent_hint?: boolean;
    traveling_execution_focus?: boolean;
    notify_member_ids?: string[];
    cgus_trip_review?: CgusTripReviewRefV1 | null;
  },
): RouteAndRunResponseDto {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  if (!payload || !response.result) return response;
  const tripId =
    String(payload.trip_id ?? '').trim() || opts?.context?.trip_id || null;
  response.result.payload = attachConversationTurnResultToPayload({
    request_id: response.request_id,
    trip_id: tripId,
    answer_text: String(response.result.answer_text ?? ''),
    result_status: String(response.result.status ?? 'OK'),
    payload,
    trusted_delivery_v1: (payload.trusted_delivery_v1 as any) ?? {
      delivery_verdict: 'VERIFIED',
      user_confirm: { required: false },
      flawed_disclosure: { present: false },
    },
    context: opts?.context,
    import_intent_hint: opts?.import_intent_hint,
    traveling_execution_focus: opts?.traveling_execution_focus,
    notify_member_ids: opts?.notify_member_ids,
    cgus_trip_review: opts?.cgus_trip_review,
  }) as any;
  return response;
}
