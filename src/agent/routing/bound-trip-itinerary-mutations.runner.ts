/**
 * 绑定行程的 CRUD / 调整 / 日重规划 / 住宿替换（从 ClaudeOrchestrator 迁出）。
 */

import type { BoundTripItineraryMutationsHost } from './bound-trip-itinerary-mutations.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { TripUserEdit } from '../../skills/trip/utils/trip-user-edit.util';
import {
  createPlanMutationApplyEditSkillAdapter,
  runPlanMutationCommand,
} from '../execution/plan-mutation-command.gateway';
import { buildSupplyGapFailureGuidance } from '../intent/intent-supply-failure.util';
import {
  buildItineraryAdjustDraftApplyAnswerText,
  executeItineraryAdjustDraftApply,
} from '../utils/itinerary-adjust-draft-apply.util';
import { detectItineraryAdjustIntent } from '../utils/itinerary-adjust-intent.util';
import {
  PENDING_ITINERARY_ADJUST_DRAFT_META_KEY,
  pendingDraftFromRequestSnapshot,
  readPendingItineraryAdjustDraft,
} from '../utils/itinerary-adjust-pending-draft.util';
import {
  buildGoldenCircleDayReplanAnswerText,
  buildGoldenCircleScheduleSlots,
  collectActivityItemIdsForDayReplan,
  detectGoldenCircleDayReplanIntent,
  goldenCircleSearchQueryForSlug,
  parseGoldenCircleDayReplanSpec,
  pickGoldenCirclePlaceFromCandidates,
  resolveGoldenCirclePlaceIdsFromTrip,
  resolveTripDayByDate,
  type GoldenCircleAnchorSlug,
  type PoiCandidateLike,
} from '../utils/itinerary-day-replan.util';
import {
  buildIntentAddAlreadyExistsAnswer,
  extractDaySearchAnchor,
  intentAlreadySatisfiedOnDay,
  isIntentBasedPoiQuery,
  resolvePlaceIdForIntentAdd,
  resolvePoiIntentProfile,
  type IntentPoiCandidate,
} from '../utils/itinerary-item-add-intent.util';
import {
  openingHoursEvidenceToText,
  suggestActivitySlotForDayAdd,
} from '../utils/itinerary-item-add-slot.util';
import {
  buildItineraryItemAddAnswerText,
  detectItineraryItemAddIntent,
  isPlausibleItineraryItemAddPoiQuery,
  itemAlreadyOnDay,
  parseItineraryItemAddSpec,
  resolvePlaceIdForAdd,
  resolveTripDayIdForAdd,
} from '../utils/itinerary-item-add.util';
import {
  buildItineraryItemDeleteAnswerText,
  detectItineraryItemDeleteIntent,
  parseItineraryItemDeleteSpec,
  resolveItemIdsForDeleteWithFallback,
  type TripLikeForDelete,
} from '../utils/itinerary-item-delete.util';
import {
  applyExistingItemDurationToUpdateSpec,
  buildItineraryItemUpdateAnswerText,
  buildIsoTimesForUpdate,
  detectItineraryItemUpdateIntent,
  parseItineraryItemUpdateSpec,
  resolveItemForUpdateWithFallback,
} from '../utils/itinerary-item-update.util';
import {
  buildLodgingReplaceAnswerText,
  detectLodgingReplaceIntent,
  findLodgingItemsOnDay,
  parseLodgingReplaceSpec,
} from '../utils/itinerary-lodging-replace.util';
import {
  buildWriteChainBlockedUserAnswerZh,
  isWriteChainSkillBlock,
} from '../utils/write-chain-skill-block.util';

export async function tryApplyBoundTripItineraryItemDelete(
  host: BoundTripItineraryMutationsHost,
  tripId: string,
  userId: string | undefined,
  message: string,
): Promise<{
  applied: boolean;
  deletedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
}> {
  if (!detectItineraryItemDeleteIntent(message)) {
    return { applied: false, reason: 'not_delete_intent' };
  }
  const spec = parseItineraryItemDeleteSpec(message);
  if (!spec) {
    return {
      applied: false,
      reason: 'parse_failed',
      answerText: '未能理解要删除的行程项，请说明第几天以及景点名称。',
    };
  }
  if (!host.tripsService) {
    return {
      applied: false,
      reason: 'trips_service_unavailable',
      answerText: buildItineraryItemDeleteAnswerText(spec, 0),
    };
  }

  let trip: TripLikeForDelete;
  try {
    trip = (await host.tripsService.findOne(tripId.trim(), userId)) as TripLikeForDelete;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary delete: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      applied: false,
      reason: 'trip_load_failed',
      answerText: buildItineraryItemDeleteAnswerText(spec, 0),
    };
  }

  const resolved = resolveItemIdsForDeleteWithFallback(trip, spec);
  const itemIds = resolved.itemIds;
  if (!itemIds.length) {
    return {
      applied: false,
      reason: 'no_matching_items',
      answerText: buildItineraryItemDeleteAnswerText(spec, 0),
      itemIds: [],
    };
  }

  try {
    const mutation = await runPlanMutationCommand(host.skillsRegistry, {
      tripId: tripId.trim(),
      userId,
      commandType: 'ITINERARY_ITEM_DELETE',
      source: 'tryApplyItineraryItemDelete',
      mode: 'db',
      edits: itemIds.map((itemId) => ({ type: 'delete' as const, itemId })),
    });
    if (mutation.reason === 'trip_apply_edit_unavailable') {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryItemDeleteAnswerText(spec, 0, resolved),
        itemIds,
      };
    }
    const out = {
      success: mutation.success,
      writeChainRequired: mutation.writeChainRequired,
      degradedReason: mutation.degradedReason ?? mutation.reason,
    };
    if (isWriteChainSkillBlock(out)) {
      return {
        applied: false,
        reason: 'write_chain_blocked',
        itemIds,
        skillsHit: ['trip.applyEdit'],
        answerText: buildWriteChainBlockedUserAnswerZh(
          '删除行程项',
          `已识别 ${itemIds.length} 项，尚未落库。`,
        ),
      };
    }
    if (out?.success) {
      return {
        applied: true,
        deletedCount: itemIds.length,
        itemIds,
        skillsHit: ['trip.applyEdit'],
        answerText: buildItineraryItemDeleteAnswerText(spec, itemIds.length, resolved),
      };
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary delete apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    applied: false,
    reason: 'apply_failed',
    skillsHit: ['trip.applyEdit'],
    answerText: buildItineraryItemDeleteAnswerText(spec, 0, resolved),
    itemIds,
  };
}

export async function tryApplyBoundTripItineraryItemAdd(
  host: BoundTripItineraryMutationsHost,
  tripId: string,
  userId: string | undefined,
  message: string,
): Promise<{
  applied: boolean;
  addedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
}> {
  if (!detectItineraryItemAddIntent(message)) {
    return { applied: false, reason: 'not_add_intent' };
  }
  if (detectItineraryAdjustIntent(message)) {
    return { applied: false, reason: 'not_add_intent' };
  }
  const spec = parseItineraryItemAddSpec(message);
  if (!spec) {
    return {
      applied: false,
      reason: 'parse_failed',
    };
  }
  if (!isPlausibleItineraryItemAddPoiQuery(spec.poiQuery)) {
    return {
      applied: false,
      reason: 'parse_failed',
    };
  }
  if (!host.tripsService) {
    return {
      applied: false,
      reason: 'trips_service_unavailable',
      answerText: buildItineraryItemAddAnswerText(spec, 0),
    };
  }

  let trip: TripLikeForDelete & {
    TripDay?: Array<{
      id?: string;
      date?: Date | string | null;
      ItineraryItem?: Array<{
        id: string;
        startTime?: Date | string | null;
        endTime?: Date | string | null;
        Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
        place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
      }>;
    }>;
  };
  try {
    trip = (await host.tripsService.findOne(tripId.trim(), userId)) as typeof trip;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary add: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      applied: false,
      reason: 'trip_load_failed',
      answerText: buildItineraryItemAddAnswerText(spec, 0),
    };
  }

  const dayResolved = resolveTripDayIdForAdd(trip, spec.dayNumber);
  const effectiveDay = dayResolved.dayNumber ?? spec.dayNumber;
  if (!dayResolved.tripDayId) {
    return {
      applied: false,
      reason: 'day_not_found',
      answerText: buildItineraryItemAddAnswerText(spec, 0, { dayNumber: effectiveDay }),
    };
  }

  const intentProfile = isIntentBasedPoiQuery(spec.poiQuery)
    ? resolvePoiIntentProfile(spec.poiQuery)
    : null;

  if (intentProfile) {
    if (intentAlreadySatisfiedOnDay(trip, effectiveDay ?? 1, intentProfile)) {
      return {
        applied: false,
        reason: 'already_exists',
        answerText: buildIntentAddAlreadyExistsAnswer(effectiveDay, intentProfile),
      };
    }
  } else if (itemAlreadyOnDay(trip, effectiveDay, spec.poiQuery)) {
    return {
      applied: false,
      reason: 'already_exists',
      answerText: buildItineraryItemAddAnswerText(spec, 0, {
        dayNumber: effectiveDay,
        alreadyExists: true,
      }),
    };
  }

  const externalCandidates: IntentPoiCandidate[] = [];
  let resolvedPlaceName = spec.poiQuery;
  let resolvedPlaceCategory: string | null = null;
  const skillsHit: string[] = [];
  const dayAnchor =
    intentProfile && effectiveDay ? extractDaySearchAnchor(trip, effectiveDay) : null;

  const poiSkill = host.skillsRegistry?.getSkill('poi.search');
  if (poiSkill) {
    skillsHit.push('poi.search');
    try {
      const searchOut = (await poiSkill.execute({
        query: intentProfile?.semanticQuery ?? spec.poiQuery,
        limit: intentProfile ? 12 : 8,
        lat: dayAnchor?.lat,
        lng: dayAnchor?.lng,
        keyword_only: intentProfile ? false : true,
      })) as {
        pois?: Array<{
          poi_id?: string;
          name?: string;
          nameCN?: string;
          nameEN?: string;
          category?: string;
          coordinates?: { lat: number; lng: number };
        }>;
      };
      for (const p of searchOut?.pois ?? []) {
        const id = Number(p.poi_id);
        if (!Number.isFinite(id)) continue;
        externalCandidates.push({
          id,
          nameCN: p.nameCN ?? p.name ?? null,
          nameEN: p.nameEN ?? null,
          category: p.category ?? null,
        });
      }
    } catch (e: unknown) {
      host.logger.warn(
        `[Claude Orchestrator] itinerary add poi.search failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (intentProfile && dayAnchor && intentProfile.geoCategories.length > 0) {
    const geoSkill = host.skillsRegistry?.getSkill('geo.findNearbyPOI');
    if (geoSkill) {
      skillsHit.push('geo.findNearbyPOI');
      try {
        const geoOut = (await geoSkill.execute({
          location: dayAnchor,
          radius: 35000,
          category: intentProfile.geoCategories,
          limit: 12,
        })) as {
          pois?: Array<{
            id?: number;
            poi_id?: string;
            name?: string;
            nameCN?: string;
            category?: string;
            distance?: number;
            distance_meters?: number;
          }>;
        };
        for (const p of geoOut?.pois ?? []) {
          const id = Number(p.id ?? p.poi_id);
          if (!Number.isFinite(id)) continue;
          externalCandidates.push({
            id,
            nameCN: p.nameCN ?? p.name ?? null,
            nameEN: null,
            category: p.category ?? null,
            distanceMeters: p.distance ?? p.distance_meters,
          });
        }
      } catch (e: unknown) {
        host.logger.warn(
          `[Claude Orchestrator] itinerary add geo.findNearbyPOI failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  const tripDestination = String((trip as { destination?: string | null }).destination ?? '');
  const countryCode = host.inferCountryFromDestination(tripDestination) ?? 'IS';

  const placeId = intentProfile
    ? resolvePlaceIdForIntentAdd(trip, effectiveDay ?? 1, externalCandidates, intentProfile)
    : resolvePlaceIdForAdd(trip, spec, externalCandidates);
  if (!placeId) {
    return {
      applied: false,
      reason: intentProfile && !dayAnchor ? 'no_day_anchor' : 'place_not_found',
      answerText: intentProfile
        ? buildSupplyGapFailureGuidance(intentProfile, {
            dayNumber: effectiveDay,
            anchorMissing: !dayAnchor,
            searchRadiusKm: 35,
            countryCode,
          })
        : buildItineraryItemAddAnswerText(spec, 0, { dayNumber: effectiveDay }),
    };
  }

  const matched =
    externalCandidates.find((c) => c.id === placeId) ??
    (() => {
      for (const day of trip.TripDay ?? []) {
        for (const item of day.ItineraryItem ?? []) {
          const place = item.Place ?? item.place;
          if (place?.id === placeId) return place;
        }
      }
      return undefined;
    })();
  if (matched?.nameCN || matched?.nameEN) {
    resolvedPlaceName = String(matched.nameCN ?? matched.nameEN);
  }
  if ((matched as { category?: string | null })?.category) {
    resolvedPlaceCategory = String((matched as { category?: string | null }).category);
  }

  let openingHoursText: string | undefined;
  const ohSkill = host.skillsRegistry?.getSkill('opening_hours.get');
  if (ohSkill) {
    skillsHit.push('opening_hours.get');
    try {
      const ohOut = (await ohSkill.execute({ poi_ids: [String(placeId)] })) as {
        opening_hours?: Array<{ opening_hours?: unknown }>;
      };
      const dayRow = (trip.TripDay ?? [])[(effectiveDay ?? 1) - 1];
      const dayDate =
        dayRow?.date instanceof Date
          ? dayRow.date
          : dayRow?.date
            ? new Date(String(dayRow.date))
            : new Date();
      openingHoursText = openingHoursEvidenceToText(
        ohOut?.opening_hours?.[0]?.opening_hours,
        dayDate,
        'Atlantic/Reykjavik',
      );
    } catch (e: unknown) {
      host.logger.debug(
        `[Claude Orchestrator] itinerary add opening_hours.get skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const dayRow = (trip.TripDay ?? [])[(effectiveDay ?? 1) - 1];
  const slot = suggestActivitySlotForDayAdd({
    tripDayDate: dayRow?.date,
    items: dayRow?.ItineraryItem ?? [],
    poiQuery: spec.poiQuery,
    placeCategory: resolvedPlaceCategory,
    openingHoursText,
    timezone: 'Atlantic/Reykjavik',
  });

  try {
    skillsHit.push('trip.applyEdit');
    const mutation = await runPlanMutationCommand(host.skillsRegistry, {
      tripId: tripId.trim(),
      userId,
      commandType: 'ITINERARY_ITEM_ADD',
      source: 'tryApplyItineraryItemAdd',
      mode: 'db',
      edits: [
        {
          type: 'add' as const,
          tripDayId: dayResolved.tripDayId,
          placeId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
      ],
    });
    if (mutation.reason === 'trip_apply_edit_unavailable') {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryItemAddAnswerText(spec, 0, {
          dayNumber: effectiveDay,
          placeName: resolvedPlaceName,
        }),
      };
    }
    const out = {
      success: mutation.success,
      writeChainRequired: mutation.writeChainRequired,
      degradedReason: mutation.degradedReason ?? mutation.reason,
      dbEdit: mutation.dbEdit as { results?: Array<{ success?: boolean }> } | undefined,
    };
    if (isWriteChainSkillBlock(out)) {
      return {
        applied: false,
        reason: 'write_chain_blocked',
        skillsHit,
        answerText: buildWriteChainBlockedUserAnswerZh(
          '新增行程项',
          `已解析「${resolvedPlaceName}」（第 ${effectiveDay} 天），尚未落库。`,
        ),
      };
    }
    if (out?.success) {
      return {
        applied: true,
        addedCount: 1,
        skillsHit,
        answerText: buildItineraryItemAddAnswerText(spec, 1, {
          dayNumber: effectiveDay,
          placeName: resolvedPlaceName,
          scheduledTimeLabel: slot.localLabel,
          scheduleReasonZh: slot.reasonZh,
        }),
      };
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary add apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    applied: false,
    reason: 'apply_failed',
    skillsHit,
    answerText: buildItineraryItemAddAnswerText(spec, 0, {
      dayNumber: effectiveDay,
      placeName: resolvedPlaceName,
    }),
  };
}

export async function tryApplyBoundTripItineraryAdjustDraft(
  host: BoundTripItineraryMutationsHost,
  tripId: string,
  userId: string | undefined,
  request: Pick<import('../dto/route-and-run.dto').RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>,
): Promise<{
  applied: boolean;
  deletedCount?: number;
  addedCount?: number;
  answerText?: string;
  targetDateIso?: string;
  reason?: string;
  skillsHit?: string[];
}> {
  let pending =
    pendingDraftFromRequestSnapshot({
      tripId,
      snapshot: request.options?.itinerary_adjust_draft_snapshot,
    }) ?? undefined;

  const durableRunId = request.options?.durable_trip_run_id?.trim();
  if (!pending && durableRunId && host.tripRunManager) {
    const meta = await host.tripRunManager.getTripRunMetadata(durableRunId);
    pending = readPendingItineraryAdjustDraft(meta ?? undefined);
    if (pending && pending.trip_id !== tripId) pending = undefined;
  }

  if (!pending) {
    return {
      applied: false,
      reason: 'no_pending_draft',
      answerText: buildItineraryAdjustDraftApplyAnswerText({
        applied: false,
        targetDateIso: '',
        reason: 'no_pending_draft',
      }),
    };
  }

  if (!host.tripsService) {
    return {
      applied: false,
      reason: 'trips_service_unavailable',
      answerText: buildItineraryAdjustDraftApplyAnswerText({
        applied: false,
        targetDateIso: pending.target_date_iso,
        dayNumber: pending.target_day_number,
        reason: 'trips_service_unavailable',
      }),
    };
  }

  // 统一经 PlanMutationGateway；Skill 缺失时 adapter execute 会返回 unavailable
  const skill = createPlanMutationApplyEditSkillAdapter(host.skillsRegistry, {
    commandType: 'ITINERARY_ADJUST_DRAFT_APPLY',
    source: 'tryApplyPendingItineraryAdjustDraft',
    userId,
  });

  const tripPois = await host.loadTripPlacePoiEvidenceForAdjust(tripId, userId);
  const researchState = {
    research_data: {
      poi_evidence: { pois: tripPois },
      pois: tripPois,
    },
  } as unknown as OrchestratorState;

  const preTrip = await host.tripsService!.findOne(tripId.trim(), userId);

  // UWC-CANARY-02: AUTHORITATIVE_CANARY XOR Legacy (no dual execution; Shadow only on legacy path)
  let canaryTechnicalFallback = false;
  try {
    const {
      extractSameDayTimeUpdatesForCanary,
    } = require('../../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.extract') as typeof import('../../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.extract');
    const {
      decideItineraryAdjustCanaryRoute,
      decideCanaryLegacyFallback,
    } = require('../../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.router') as typeof import('../../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.router');
    const {
      executeItineraryAdjustAuthoritativeCanary,
    } = require('../../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.executor') as typeof import('../../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.executor');

    const targetDateIso = String(pending.target_date_iso ?? '').slice(0, 10);
    const tripDays =
      ((preTrip as { TripDay?: Array<{ date?: Date | string | null; ItineraryItem?: unknown[]; items?: unknown[] }> })
        .TripDay ??
        (preTrip as { days?: Array<{ date?: Date | string | null; ItineraryItem?: unknown[]; items?: unknown[] }> })
          .days ??
        []) as Array<{
        date?: Date | string | null;
        ItineraryItem?: Array<Record<string, unknown>>;
        items?: Array<Record<string, unknown>>;
      }>;
    const tripDay = tripDays.find(
      (d) => String(d.date ?? '').slice(0, 10) === targetDateIso,
    );
    const rawItems = (tripDay?.ItineraryItem ?? tripDay?.items ?? []) as Array<
      Record<string, unknown>
    >;
    const extract = extractSameDayTimeUpdatesForCanary({
      targetDateIso,
      tripDayDate: tripDay?.date,
      tripItems: rawItems.map((it) => ({
        id: String(it.id ?? ''),
        startTime: (it.startTime as Date | string | null | undefined) ?? null,
        endTime: (it.endTime as Date | string | null | undefined) ?? null,
        placeId: (it.placeId as number | null | undefined) ?? null,
        isPaid: Boolean(it.isPaid),
        bookedAt: (it.bookedAt as Date | string | null | undefined) ?? null,
        bookingStatus: (it.bookingStatus as string | null | undefined) ?? null,
        bookingConfirmation:
          (it.bookingConfirmation as string | null | undefined) ?? null,
        productOfferingId:
          (it.productOfferingId as string | null | undefined) ?? null,
        locked: Boolean(it.locked),
      })),
      draftItems: (pending.itinerary_day?.items ?? []).map((it) => ({
        id: String(it.id ?? ''),
        start_window: String(it.start_window ?? ''),
        end_window: String(it.end_window ?? ''),
        location_ref: it.location_ref,
      })),
    });

    if (extract.ok) {
      const route = decideItineraryAdjustCanaryRoute({
        routingKey:
          durableRunId ??
          `${tripId}:${targetDateIso}:${pending.saved_at ?? pending.request_id}`,
        admission: {
          tripId: tripId.trim(),
          operation: extract.operation,
          targetDateIso,
          applyMode: pending.apply_mode,
          timeUpdates: extract.timeUpdates,
          itemFlags: extract.itemFlags,
        },
      });

      if (route.selectedForCanary) {
        try {
          const tripRev =
            typeof (preTrip as { revision?: number })?.revision === 'number'
              ? (preTrip as { revision: number }).revision
              : 0;
          const uwc = await executeItineraryAdjustAuthoritativeCanary({
            prisma: host.prisma,
            tripId: tripId.trim(),
            idempotencyKey: String(
              durableRunId ??
                `itinerary-canary:${tripId}:${pending.saved_at ?? pending.request_id}`,
            ),
            expectedTripRevision: tripRev,
            timeUpdates: extract.timeUpdates,
          });

          if (
            uwc.outcome === 'CONFLICT' ||
            uwc.outcome === 'REJECTED' ||
            uwc.outcome === 'VERIFICATION_REQUIRED'
          ) {
            const fb = decideCanaryLegacyFallback({
              uwcOutcome: uwc.outcome,
              uwcErrorCode: uwc.errorCode,
              sideEffectsStarted: false,
            });
            if (!fb.allowLegacyFallback) {
              return {
                applied: false,
                reason: `uwc_canary_${String(uwc.outcome).toLowerCase()}`,
                targetDateIso,
                skillsHit: ['uwc.itinerary_adjust_canary'],
                answerText: buildItineraryAdjustDraftApplyAnswerText({
                  applied: false,
                  targetDateIso,
                  dayNumber: pending.target_day_number,
                  reason: `uwc_canary_${String(uwc.outcome).toLowerCase()}`,
                }),
              };
            }
          }

          if (
            uwc.outcome === 'APPLIED' ||
            uwc.outcome === 'IDEMPOTENT_REPLAY'
          ) {
            if (durableRunId && host.tripRunManager) {
              await host.tripRunManager.updateTripRun({
                runId: durableRunId,
                metadata: { [PENDING_ITINERARY_ADJUST_DRAFT_META_KEY]: null },
              });
            }
            if (host.itineraryVersion) {
              try {
                const postTrip = await host.tripsService!.findOne(
                  tripId.trim(),
                  userId,
                );
                void host.itineraryVersion.persistUserEditRevision({
                  tripId: tripId.trim(),
                  userId,
                  preItinerary: preTrip,
                  postItinerary: postTrip,
                  summary: `ITINERARY_ADJUST UWC canary: ${targetDateIso}`,
                  source: 'ITINERARY_ADJUST',
                });
              } catch {
                // best-effort
              }
            }
            return {
              applied: true,
              targetDateIso,
              deletedCount: 0,
              addedCount: 0,
              skillsHit: ['uwc.itinerary_adjust_canary'],
              answerText: buildItineraryAdjustDraftApplyAnswerText({
                applied: true,
                targetDateIso,
                dayNumber: pending.target_day_number,
                deletedCount: 0,
                addedCount: 0,
              }),
            };
          }

          return {
            applied: false,
            reason: `uwc_canary_${String(uwc.outcome).toLowerCase()}`,
            targetDateIso,
            skillsHit: ['uwc.itinerary_adjust_canary'],
            answerText: buildItineraryAdjustDraftApplyAnswerText({
              applied: false,
              targetDateIso,
              dayNumber: pending.target_day_number,
              reason: `uwc_canary_${String(uwc.outcome).toLowerCase()}`,
            }),
          };
        } catch (err) {
          const fb = decideCanaryLegacyFallback({
            technicalExceptionBeforeSideEffects: true,
            sideEffectsStarted: false,
          });
          if (!fb.allowLegacyFallback) {
            throw err;
          }
          canaryTechnicalFallback = true;
          host.logger.warn(
            `[ITINERARY_ADJUST] canary technical fallback to legacy: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
  } catch (err) {
    host.logger.warn(
      `[ITINERARY_ADJUST] canary route skipped: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  void canaryTechnicalFallback;

  let uwcCapture: import('../../decision-runtime/execution/authoritative-write/authoritative-write-shadow-probe.service').ShadowCaptureToken | null =
    null;
  try {
    const {
      safeBeginItineraryAdjustCapture,
    } = require('../../decision-runtime/execution/authoritative-write/authoritative-write-shadow-probe.service') as typeof import('../../decision-runtime/execution/authoritative-write/authoritative-write-shadow-probe.service');
    const tripRev =
      typeof (preTrip as { revision?: number })?.revision === 'number'
        ? (preTrip as { revision: number }).revision
        : 0;
    uwcCapture = safeBeginItineraryAdjustCapture({
      tripId,
      userId,
      requestId: durableRunId ?? tripId,
      hasPendingDraft: true,
      adviceOnly: false,
      pending: true,
      expectedTripRevision: tripRev,
      observedTripRevision: tripRev,
      tripRevision: tripRev,
    });
  } catch {
    uwcCapture = null;
  }

  const result = await executeItineraryAdjustDraftApply({
    tripId,
    userId,
    pending,
    loadTrip: async () =>
      (await host.tripsService!.findOne(tripId.trim(), userId)) as TripLikeForDelete,
    resolvePlaceId: (item) =>
      host.resolvePlaceIdForItineraryAdjustApply(item, researchState),
    researchPools: [tripPois],
    applyEditSkill: skill as {
      execute: (input: {
        mode: 'db';
        tripId: string;
        edits: TripUserEdit[];
      }) => Promise<{ success?: boolean }>;
    },
  });

  try {
    const {
      safeCompleteItineraryAdjustCapture,
    } = require('../../decision-runtime/execution/authoritative-write/authoritative-write-shadow-probe.service') as typeof import('../../decision-runtime/execution/authoritative-write/authoritative-write-shadow-probe.service');
    safeCompleteItineraryAdjustCapture(uwcCapture, {
      legacyApplied: Boolean(result.applied),
      legacyOutcomeHint: result.applied ? 'APPLIED' : 'REJECTED',
      reasonCodes: result.reason ? [result.reason] : [],
      raw: {
        addedCount: result.addedCount,
        deletedCount: result.deletedCount,
      },
    });
  } catch {
    // never break legacy apply
  }

  if (result.applied && durableRunId && host.tripRunManager) {
    await host.tripRunManager.updateTripRun({
      runId: durableRunId,
      metadata: { [PENDING_ITINERARY_ADJUST_DRAFT_META_KEY]: null },
    });
  }

  if (result.applied && host.itineraryVersion) {
    try {
      const postTrip = await host.tripsService!.findOne(tripId.trim(), userId);
      void host.itineraryVersion.persistUserEditRevision({
        tripId: tripId.trim(),
        userId,
        preItinerary: preTrip,
        postItinerary: postTrip,
        summary: `ITINERARY_ADJUST apply: ${result.targetDateIso ?? pending.target_date_iso}`,
        source: 'ITINERARY_ADJUST',
      });
    } catch {
      // best-effort alignment capture
    }
  }

  return result;
}

export async function tryApplyBoundTripItineraryDayReplan(
  host: BoundTripItineraryMutationsHost,
  tripId: string,
  userId: string | undefined,
  message: string,
  dateRange?: { start_date?: string; end_date?: string },
): Promise<{
  applied: boolean;
  deletedCount?: number;
  addedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
}> {
  if (!detectGoldenCircleDayReplanIntent(message)) {
    return { applied: false, reason: 'not_day_replan_intent' };
  }
  const spec = parseGoldenCircleDayReplanSpec(message, dateRange);
  if (!spec) {
    return {
      applied: false,
      reason: 'parse_failed',
      answerText: '未能理解要重排的行程日，请说明日期与黄金圈景点。',
    };
  }
  if (!host.tripsService) {
    return {
      applied: false,
      reason: 'trips_service_unavailable',
      answerText: buildGoldenCircleDayReplanAnswerText({
        targetDateIso: spec.targetDateIso,
        placeNames: [],
        deletedCount: 0,
        addedCount: 0,
      }),
    };
  }

  let trip: TripLikeForDelete & {
    TripDay?: Array<{
      id?: string;
      date?: Date | string | null;
      ItineraryItem?: Array<{
        id: string;
        type?: string;
        Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
        place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
      }>;
    }>;
  };
  try {
    trip = (await host.tripsService.findOne(tripId.trim(), userId)) as typeof trip;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary day replan: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      applied: false,
      reason: 'trip_load_failed',
      answerText: buildGoldenCircleDayReplanAnswerText({
        targetDateIso: spec.targetDateIso,
        placeNames: [],
        deletedCount: 0,
        addedCount: 0,
      }),
    };
  }

  const dayResolved = resolveTripDayByDate(trip, spec.targetDateIso);
  if (!dayResolved.tripDayId) {
    return {
      applied: false,
      reason: 'day_not_found',
      answerText: buildGoldenCircleDayReplanAnswerText({
        targetDateIso: spec.targetDateIso,
        placeNames: [],
        deletedCount: 0,
        addedCount: 0,
      }),
    };
  }

  const skillsHit: string[] = [];
  const placeIds: Partial<Record<GoldenCircleAnchorSlug, number>> = resolveGoldenCirclePlaceIdsFromTrip(trip);
  const poiSkill = host.skillsRegistry?.getSkill('poi.search');
  const searchCache = new Map<GoldenCircleAnchorSlug, PoiCandidateLike[]>();

  for (const slug of spec.anchorSlugs) {
    if (placeIds[slug] != null) continue;
    if (!poiSkill) continue;
    skillsHit.push('poi.search');
    try {
      const searchOut = (await poiSkill.execute({
        query: goldenCircleSearchQueryForSlug(slug),
        limit: 10,
        keyword_only: true,
      })) as { pois?: PoiCandidateLike[] };
      const pois = searchOut?.pois ?? [];
      searchCache.set(slug, pois);
      const picked = pickGoldenCirclePlaceFromCandidates(slug, pois);
      if (picked != null) placeIds[slug] = picked;
    } catch (e: unknown) {
      host.logger.warn(
        `[Claude Orchestrator] day replan poi.search(${slug}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const missing = spec.anchorSlugs.filter((slug) => placeIds[slug] == null);
  if (missing.length > 0) {
    return {
      applied: false,
      reason: 'place_not_found',
      skillsHit,
      answerText: buildGoldenCircleDayReplanAnswerText({
        dayNumber: dayResolved.dayNumber,
        targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
        placeNames: spec.anchorSlugs.filter((s) => placeIds[s] != null).map((s) => s),
        deletedCount: 0,
        addedCount: 0,
      }),
    };
  }

  const placeNames: string[] = [];
  for (const slug of spec.anchorSlugs) {
    const pid = placeIds[slug]!;
    let label: string = slug;
    outer: for (const day of trip.TripDay ?? []) {
      for (const item of day.ItineraryItem ?? []) {
        const place = item.Place ?? item.place;
        if (place?.id === pid) {
          label = String(place.nameCN ?? place.nameEN ?? slug);
          break outer;
        }
      }
    }
    if (label === slug) {
      for (const pois of searchCache.values()) {
        const hit = pois.find((p) => Number(p.id ?? p.poi_id) === pid);
        if (hit) {
          label = String(hit.nameCN ?? hit.nameEN ?? hit.name ?? slug);
          break;
        }
      }
    }
    placeNames.push(label);
  }

  const dayRow = (trip.TripDay ?? []).find((d) => d.id === dayResolved.tripDayId);
  const schedule = buildGoldenCircleScheduleSlots(dayRow?.date ?? spec.targetDateIso);
  const deleteIds = collectActivityItemIdsForDayReplan(dayResolved.items);

  const edits = [
    ...deleteIds.map((itemId) => ({ type: 'delete' as const, itemId })),
    ...schedule.map((slot) => ({
      type: 'add' as const,
      tripDayId: dayResolved.tripDayId!,
      placeId: placeIds[slot.slug]!,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  ];

  try {
    skillsHit.push('trip.applyEdit');
    const mutation = await runPlanMutationCommand(host.skillsRegistry, {
      tripId: tripId.trim(),
      userId,
      commandType: 'ITINERARY_DAY_REPLAN',
      source: 'tryApplyGoldenCircleDayReplan',
      mode: 'db',
      edits,
    });
    if (mutation.reason === 'trip_apply_edit_unavailable') {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        skillsHit,
        answerText: buildGoldenCircleDayReplanAnswerText({
          dayNumber: dayResolved.dayNumber,
          targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
          placeNames,
          deletedCount: 0,
          addedCount: 0,
        }),
      };
    }
    const out = {
      success: mutation.success,
      writeChainRequired: mutation.writeChainRequired,
      degradedReason: mutation.degradedReason ?? mutation.reason,
    };
    if (isWriteChainSkillBlock(out)) {
      return {
        applied: false,
        reason: 'write_chain_blocked',
        skillsHit,
        answerText: buildWriteChainBlockedUserAnswerZh(
          '单日重排',
          `已识别第 ${dayResolved.dayNumber} 天草案，尚未落库。`,
        ),
      };
    }
    if (out?.success) {
      return {
        applied: true,
        deletedCount: deleteIds.length,
        addedCount: schedule.length,
        skillsHit,
        answerText: buildGoldenCircleDayReplanAnswerText({
          dayNumber: dayResolved.dayNumber,
          targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
          placeNames,
          deletedCount: deleteIds.length,
          addedCount: schedule.length,
        }),
      };
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary day replan apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    applied: false,
    reason: 'apply_failed',
    skillsHit,
    answerText: buildGoldenCircleDayReplanAnswerText({
      dayNumber: dayResolved.dayNumber,
      targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
      placeNames,
      deletedCount: 0,
      addedCount: 0,
    }),
  };
}

export async function tryApplyBoundTripLodgingReplace(
  host: BoundTripItineraryMutationsHost,
  tripId: string,
  userId: string | undefined,
  message: string,
  dateRange?: { start_date?: string; end_date?: string },
): Promise<{
  applied: boolean;
  answerText?: string;
  checkInIso?: string;
  fromName?: string;
  toName?: string;
  reason?: string;
  skillsHit?: string[];
}> {
  if (!detectLodgingReplaceIntent(message)) {
    return { applied: false, reason: 'not_lodging_replace_intent' };
  }
  const spec = parseLodgingReplaceSpec(message, dateRange);
  if (!spec?.toName) {
    return {
      applied: false,
      reason: 'parse_failed',
      answerText: buildLodgingReplaceAnswerText(
        { toName: '目标住宿' },
        { applied: false, reason: 'parse_failed' },
      ),
    };
  }

  if (!host.tripsService) {
    return {
      applied: false,
      reason: 'trips_service_unavailable',
      fromName: spec.fromName,
      toName: spec.toName,
      checkInIso: spec.checkInIso,
      answerText: buildLodgingReplaceAnswerText(spec, {
        applied: false,
        reason: 'trips_service_unavailable',
      }),
    };
  }

  let trip: TripLikeForDelete;
  try {
    trip = (await host.tripsService.findOne(tripId.trim(), userId)) as TripLikeForDelete;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] lodging replace: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      applied: false,
      reason: 'trip_load_failed',
      fromName: spec.fromName,
      toName: spec.toName,
      checkInIso: spec.checkInIso,
      answerText: buildLodgingReplaceAnswerText(spec, {
        applied: false,
        reason: 'trip_load_failed',
      }),
    };
  }

  const found = findLodgingItemsOnDay(trip, spec.checkInIso, spec.fromName);
  if (!found.tripDayId || !found.dateIso) {
    return {
      applied: false,
      reason: 'day_not_found',
      fromName: spec.fromName,
      toName: spec.toName,
      checkInIso: spec.checkInIso,
      answerText: buildLodgingReplaceAnswerText(spec, {
        applied: false,
        checkInIso: spec.checkInIso,
        dayNumber: found.dayNumber,
        reason: 'day_not_found',
      }),
    };
  }

  const replacedFrom =
    found.matched[0]?.name ??
    found.allRest[0]?.name ??
    spec.fromName ??
    '原住宿';

  if (!host.planningAssistantV2Service) {
    return {
      applied: false,
      reason: 'pa_unavailable',
      fromName: replacedFrom,
      toName: spec.toName,
      checkInIso: found.dateIso,
      answerText: buildLodgingReplaceAnswerText(spec, {
        applied: false,
        checkInIso: found.dateIso,
        dayNumber: found.dayNumber,
        replacedFrom,
        reason: 'pa_unavailable',
      }),
    };
  }

  const checkIn = found.dateIso.slice(0, 10);
  const checkOutDate = new Date(`${checkIn}T00:00:00.000Z`);
  checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 1);
  const checkOut = checkOutDate.toISOString().slice(0, 10);

  try {
    const out = await host.planningAssistantV2Service.applyAccommodationToItinerary(tripId.trim(), {
      sessionId: `lodging-replace:${tripId.trim()}:${checkIn}`,
      accommodationIndex: 0,
      replaceExisting: true,
      accommodation: {
        id: `nl-replace-${Buffer.from(spec.toName).toString('base64url').slice(0, 24)}`,
        source: 'hotel',
        name: spec.toName,
        nameCN: spec.toName,
        checkIn,
        checkOut,
      },
    });
    if (out?.success) {
      return {
        applied: true,
        skillsHit: ['planning_assistant.accommodations.apply'],
        fromName: replacedFrom,
        toName: spec.toName,
        checkInIso: checkIn,
        answerText: buildLodgingReplaceAnswerText(spec, {
          applied: true,
          checkInIso: checkIn,
          dayNumber: found.dayNumber,
          replacedFrom,
        }),
      };
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] lodging replace apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    applied: false,
    reason: 'apply_failed',
    skillsHit: ['planning_assistant.accommodations.apply'],
    fromName: replacedFrom,
    toName: spec.toName,
    checkInIso: checkIn,
    answerText: buildLodgingReplaceAnswerText(spec, {
      applied: false,
      checkInIso: checkIn,
      dayNumber: found.dayNumber,
      replacedFrom,
      reason: 'apply_failed',
    }),
  };
}

export async function tryApplyBoundTripItineraryItemUpdate(
  host: BoundTripItineraryMutationsHost,
  tripId: string,
  userId: string | undefined,
  message: string,
): Promise<{
  applied: boolean;
  updatedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
}> {
  if (!detectItineraryItemUpdateIntent(message)) {
    return { applied: false, reason: 'not_update_intent' };
  }
  const spec = parseItineraryItemUpdateSpec(message);
  if (!spec) {
    return {
      applied: false,
      reason: 'parse_failed',
      answerText: '未能理解要修改的行程时间，请说明景点名称以及开始/结束时间。',
    };
  }
  if (!host.tripsService) {
    return {
      applied: false,
      reason: 'trips_service_unavailable',
      answerText: buildItineraryItemUpdateAnswerText(spec, false),
    };
  }

  let trip: TripLikeForDelete & {
    TripDay?: Array<{
      id?: string;
      date?: Date | string | null;
      ItineraryItem?: Array<{
        id: string;
        Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
        place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
      }>;
    }>;
  };
  try {
    trip = (await host.tripsService.findOne(tripId.trim(), userId)) as typeof trip;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary update: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      applied: false,
      reason: 'trip_load_failed',
      answerText: buildItineraryItemUpdateAnswerText(spec, false),
    };
  }

  const resolved = resolveItemForUpdateWithFallback(trip, spec);
  if (!resolved.itemId) {
    return {
      applied: false,
      reason: 'no_matching_items',
      answerText: buildItineraryItemUpdateAnswerText(spec, false, {
        dayNumber: spec.dayNumber,
      }),
    };
  }

  const effectiveSpec = applyExistingItemDurationToUpdateSpec(spec, resolved.matchedItem);
  const times = buildIsoTimesForUpdate(resolved.tripDayDate, effectiveSpec);
  try {
    const mutation = await runPlanMutationCommand(host.skillsRegistry, {
      tripId: tripId.trim(),
      userId,
      commandType: 'ITINERARY_ITEM_UPDATE',
      source: 'tryApplyItineraryItemUpdate',
      mode: 'db',
      edits: [
        {
          type: 'update' as const,
          itemId: resolved.itemId,
          updates: {
            startTime: times.startTime,
            endTime: times.endTime,
          },
        },
      ],
    });
    if (mutation.reason === 'trip_apply_edit_unavailable') {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryItemUpdateAnswerText(spec, false, {
          dayNumber: resolved.matchedDayNumber,
          placeName: resolved.placeName,
          localLabel: times.localLabel,
          usedDayFallback: resolved.usedDayFallback,
        }),
        itemIds: [resolved.itemId],
      };
    }
    const out = {
      success: mutation.success,
      writeChainRequired: mutation.writeChainRequired,
      degradedReason: mutation.degradedReason ?? mutation.reason,
    };
    if (isWriteChainSkillBlock(out)) {
      return {
        applied: false,
        reason: 'write_chain_blocked',
        itemIds: [resolved.itemId],
        skillsHit: ['trip.applyEdit'],
        answerText: buildWriteChainBlockedUserAnswerZh(
          '修改行程项时间',
          `已识别「${resolved.placeName}」，尚未落库。`,
        ),
      };
    }
    if (out?.success) {
      return {
        applied: true,
        updatedCount: 1,
        itemIds: [resolved.itemId],
        skillsHit: ['trip.applyEdit'],
        answerText: buildItineraryItemUpdateAnswerText(spec, true, {
          dayNumber: resolved.matchedDayNumber,
          placeName: resolved.placeName,
          localLabel: times.localLabel,
          usedDayFallback: resolved.usedDayFallback,
        }),
      };
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary update apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    applied: false,
    reason: 'apply_failed',
    skillsHit: ['trip.applyEdit'],
    answerText: buildItineraryItemUpdateAnswerText(spec, false, {
      dayNumber: resolved.matchedDayNumber,
      placeName: resolved.placeName,
      localLabel: times.localLabel,
      usedDayFallback: resolved.usedDayFallback,
    }),
    itemIds: [resolved.itemId],
  };
}
