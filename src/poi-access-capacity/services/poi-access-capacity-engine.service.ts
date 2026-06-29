/**
 * POI Access & Capacity Engine — 整趟行程评估（Readiness P0）
 */

import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { PoiAccessCapacityService } from '../poi-access-capacity.service';
import { resolvePoiAccessSlugFromPlaceMetadata } from '../utils/resolve-poi-slug.util';
import type { PoiAccessTripEvaluation } from '../types/poi-access-readiness.types';
import {
  evidenceToUserReservations,
  hasReservationEvidenceForSlot,
  readReservationEvidenceStore,
} from '../utils/trip-reservation-evidence.util';
import { mapAccessVerdictToIssueKind } from '../types/poi-access-readiness.types';
import type { PoiAccessTargetResource } from '../interfaces/poi-access-capacity.interface';
import { logThrottledDebug } from '../../common/utils/throttled-debug-log.util';

const POI_ITEM_TYPES = new Set(['POI', 'ACTIVITY', 'VIEWPOINT', 'NATURE']);

@Injectable()
export class PoiAccessCapacityEngineService {
  private readonly logger = new Logger(PoiAccessCapacityEngineService.name);
  private readonly evaluateTripInflight = new Map<string, Promise<PoiAccessTripEvaluation[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly poiAccess: PoiAccessCapacityService,
  ) {}

  isIcelandTrip(trip: { destination: string; metadata?: unknown }): boolean {
    const dest = trip.destination.trim().toLowerCase();
    if (
      dest === 'is' ||
      dest === 'iceland' ||
      dest.includes('iceland') ||
      dest.includes('冰岛') ||
      dest.includes('reykjavik') ||
      dest.includes('雷克雅未克')
    ) {
      return true;
    }
    const meta =
      trip.metadata && typeof trip.metadata === 'object'
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const country = String(meta.countryCode ?? meta.destinationCountry ?? '').toLowerCase();
    return country === 'is' || country === 'iceland';
  }

  async evaluateTrip(tripId: string): Promise<PoiAccessTripEvaluation[]> {
    const inflight = this.evaluateTripInflight.get(tripId);
    if (inflight) return inflight;

    const promise = this.evaluateTripInner(tripId).finally(() => {
      this.evaluateTripInflight.delete(tripId);
    });
    this.evaluateTripInflight.set(tripId, promise);
    return promise;
  }

  private async evaluateTripInner(tripId: string): Promise<PoiAccessTripEvaluation[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { order: 'asc' },
              include: { Place: true },
            },
          },
        },
      },
    });
    if (!trip || !this.isIcelandTrip(trip)) {
      return [];
    }

    const evidenceStore = readReservationEvidenceStore(trip.metadata);
    const userReservations = evidenceToUserReservations(evidenceStore);
    const vehicleType = this.resolveVehicleType(trip.metadata);
    const results: PoiAccessTripEvaluation[] = [];

    for (let dayIdx = 0; dayIdx < trip.TripDay.length; dayIdx += 1) {
      const day = trip.TripDay[dayIdx];
      const dayNumber = dayIdx + 1;
      const dateISO = DateTime.fromJSDate(day.date).toISODate() ?? day.date.toISOString().slice(0, 10);

      for (const item of day.ItineraryItem) {
        const itemType = String(item.type ?? 'POI').toUpperCase();
        if (!POI_ITEM_TYPES.has(itemType)) continue;

        const poiName =
          item.Place?.nameCN ?? item.Place?.nameEN ?? item.note ?? item.id;
        const poiId = resolvePoiAccessSlugFromPlaceMetadata(
          item.Place?.metadata,
          poiName,
        );
        if (!poiId) continue;

        const rules = await this.poiAccess.getRulesForPoiSlugs([poiId]);
        if (!rules.length) continue;

        const arrivalTime = item.startTime
          ? DateTime.fromJSDate(item.startTime).toFormat('HH:mm')
          : '10:00';

        const resource: PoiAccessTargetResource =
          rules.some((r) => r.ruleType === 'PARKING_RESERVATION') ? 'PARKING' : 'POI';

        const hasEvidence =
          hasReservationEvidenceForSlot({
            evidence: evidenceStore,
            tripItemId: item.id,
            poiId,
            resource,
            dateISO,
            plannedArrival: arrivalTime,
          }) ||
          Boolean(item.bookingConfirmation) ||
          userReservations.some(
            (r) =>
              r.dateISO.slice(0, 10) === dateISO.slice(0, 10) &&
              (r.resource === resource || r.resource === 'POI'),
          );

        const itemReservations = [
          ...userReservations,
          ...(item.bookingConfirmation
            ? [{ resource, dateISO, slotStartTime: arrivalTime }]
            : []),
        ];

        const evaluation = await this.poiAccess.evaluate({
          poiId,
          poiName,
          dateISO,
          arrivalTime,
          vehicleType,
          userReservations: hasEvidence ? itemReservations : userReservations,
        });

        if (!mapAccessVerdictToIssueKind(evaluation.verdict)) continue;

        results.push({
          tripItemId: item.id,
          tripDayId: day.id,
          dayNumber,
          poiId,
          poiName,
          dateISO,
          arrivalTime,
          raw: evaluation,
          hasReservationEvidence: hasEvidence,
        });
      }
    }

    logThrottledDebug(
      this.logger,
      `poi-access:evaluate:${tripId}`,
      `evaluateTrip ${tripId}: ${results.length} non-feasible POI`,
    );
    return results;
  }

  private resolveVehicleType(metadata: unknown): string | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const m = metadata as Record<string, unknown>;
    const constraints = m.constraints as Record<string, unknown> | undefined;
    const vt = constraints?.vehicle_type ?? m.vehicleType;
    return typeof vt === 'string' ? vt : undefined;
  }
}
