/**
 * INTAKE 槽位候选：TripDay 快照 / PA TripContext / Layer1 候选（从 ClaudeOrchestrator 迁出）。
 */

import type { ItinerarySlotPlacementIntakeHost } from './itinerary-slot-placement-intake.host';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { TripDaySnapshotForPlacement } from '../utils/route-and-run-intent-analyzer.util';
import type { ItinerarySlotPlacementGapResult } from '../assistants/trip-planner/interfaces/itinerary-slot-placement.interface';
import {
  mapTripDaysToPlacementSnapshots,
  suggestItinerarySlotCandidates,
  type ItinerarySlotCandidate,
} from '../utils/itinerary-slot-placement.util';
import {
  buildTripContextFromPrismaRow,
  type PrismaTripRowForPaContext,
} from '../utils/trip-context-from-prisma.util';
import {
  appendPolishAuditToAnalysisPath,
  paSuggestedDaysToSlotCandidatesWithPolish,
  shouldPreferPaSlotCandidates,
} from '../utils/itinerary-slot-pa-bridge.util';

export async function loadTripDaySnapshotsForSlotPlacement(
  host: ItinerarySlotPlacementIntakeHost,
  tripId: string,
  userId?: string,
): Promise<TripDaySnapshotForPlacement[]> {
  const tid = tripId.trim();
  if (!tid) return [];

  const uid = userId?.trim();
  if (uid) {
    const collaborator = await host.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId: tid, userId: uid } },
    });
    if (!collaborator) return [];
  }

  const row = await host.prisma.trip.findUnique({
    where: { id: tid },
    select: {
      TripDay: {
        orderBy: { date: 'asc' as const },
        select: {
          date: true,
          ItineraryItem: {
            orderBy: { order: 'asc' as const },
            select: {
              type: true,
              note: true,
              Place: { select: { nameCN: true, nameEN: true } },
            },
          },
        },
      },
    },
  });
  if (!row?.TripDay?.length) return [];
  return mapTripDaysToPlacementSnapshots(row.TripDay);
}

/** PA Layer1：完整 TripContext（含 items 时间窗，供 ContextAnalyzer 缺口检测） */
export async function loadTripContextForPaSlotPlacement(
  host: ItinerarySlotPlacementIntakeHost,
  tripId: string,
  userId?: string,
): Promise<ReturnType<typeof buildTripContextFromPrismaRow> | null> {
  const tid = tripId.trim();
  if (!tid) return null;

  const uid = userId?.trim();
  if (uid) {
    const collaborator = await host.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId: tid, userId: uid } },
    });
    if (!collaborator) return null;
  }

  const row = (await host.prisma.trip.findUnique({
    where: { id: tid },
    select: {
      id: true,
      destination: true,
      startDate: true,
      endDate: true,
      status: true,
      budgetConfig: true,
      pacingConfig: true,
      metadata: true,
      TripDay: {
        orderBy: { date: 'asc' as const },
        select: {
          id: true,
          date: true,
          ItineraryItem: {
            orderBy: { order: 'asc' as const },
            select: {
              id: true,
              type: true,
              startTime: true,
              endTime: true,
              estimatedCost: true,
              travelFromPreviousDuration: true,
              note: true,
              Place: { select: { nameCN: true, nameEN: true } },
            },
          },
        },
      },
    },
  })) as PrismaTripRowForPaContext | null;

  if (!row) return null;
  return buildTripContextFromPrismaRow(row);
}

/**
 * Layer1 槽位候选：优先 PA ContextAnalyzer，失败则启发式 TripDay 打分。
 */
export async function resolveItinerarySlotCandidatesForIntake(
  host: ItinerarySlotPlacementIntakeHost,
  intakeMsg: string,
  trip: TripPlanRequest | undefined | null,
  tripId: string,
  userId: string | undefined,
  tripDaySnapshots: TripDaySnapshotForPlacement[],
): Promise<{
  candidates: ItinerarySlotCandidate[];
  paAnalysis?: ItinerarySlotPlacementGapResult;
}> {
  const fallback = (): ItinerarySlotCandidate[] =>
    suggestItinerarySlotCandidates(trip, tripDaySnapshots, intakeMsg);

  if (!host.contextAnalyzerService) {
    return { candidates: fallback() };
  }

  try {
    const tripCtx = await loadTripContextForPaSlotPlacement(host, tripId, userId);
    if (!tripCtx) {
      return { candidates: fallback() };
    }

    const pa = host.contextAnalyzerService.analyzeItinerarySlotPlacement(intakeMsg, tripCtx);

    if (!pa.suggestedDays?.length) {
      host.logger.debug(
        `[INTAKE] PA graph fracture (empty suggestedDays); heuristic fallback trip_id=${tripId}`,
      );
      return {
        candidates: fallback(),
        paAnalysis: { ...pa, fallbackReason: 'GRAPH_FRACTURE' },
      };
    }

    if (shouldPreferPaSlotCandidates(pa)) {
      const candidates = await paSuggestedDaysToSlotCandidatesWithPolish(pa, {
        polisher: host.itinerarySlotPolisher,
        tripId,
        tripContext: tripCtx,
        onPolishAudit: (tag) => appendPolishAuditToAnalysisPath(pa, tag),
      });
      if (!candidates.length) {
        return {
          candidates: fallback(),
          paAnalysis: { ...pa, fallbackReason: 'EMPTY_CANDIDATES' },
        };
      }
      return { candidates, paAnalysis: pa };
    }
    host.logger.debug(
      `[INTAKE] PA slot placement low confidence (${pa.confidence}); heuristic fallback trip_id=${tripId}`,
    );
    return {
      candidates: fallback(),
      paAnalysis: { ...pa, fallbackReason: 'LOW_CONFIDENCE' },
    };
  } catch (e: unknown) {
    host.logger.warn(
      `[INTAKE] PA slot placement failed, heuristic fallback: ${(e as Error)?.message ?? e}`,
    );
  }

  return { candidates: fallback() };
}
