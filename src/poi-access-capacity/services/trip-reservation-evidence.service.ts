/**
 * 预约凭证持久化 + issue 清除
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import type { PoiAccessTargetResource } from '../interfaces/poi-access-capacity.interface';
import {
  formatDateISO,
  normalizeTripReservationEvidenceInput,
  readReservationEvidenceStore,
  TRIP_RESERVATION_EVIDENCE_METADATA_KEY,
  type TripReservationEvidenceInput,
  type TripReservationEvidenceStore,
} from '../utils/trip-reservation-evidence.util';

type TripWithItems = {
  metadata: unknown;
  TripDay: Array<{
    date: Date;
    ItineraryItem: Array<{ id: string; startTime: Date | null }>;
  }>;
};

@Injectable()
export class TripReservationEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertEvidence(
    tripId: string,
    userId: string,
    rawInput: TripReservationEvidenceInput & Record<string, unknown>,
  ): Promise<{ tripId: string; evidence: TripReservationEvidenceStore }> {
    const input = normalizeTripReservationEvidenceInput(rawInput);

    if (!input.tripItemId?.trim()) {
      throw new BadRequestException('tripItemId 必填');
    }
    if (!input.poiId?.trim()) {
      throw new BadRequestException('poiId 必填');
    }

    const trip = (await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: { select: { id: true, startTime: true } },
          },
        },
      },
    })) as TripWithItems | null;
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const itemIds = new Set(
      trip.TripDay.flatMap((d) => d.ItineraryItem.map((i) => i.id)),
    );
    if (!itemIds.has(input.tripItemId)) {
      throw new BadRequestException(`tripItemId ${input.tripItemId} 不属于该行程`);
    }

    const resolved = resolveEvidenceSlot(trip, input);
    const dateISO = resolved.dateISO;
    const slotStartTime = resolved.slotStartTime;

    if (!input.confirmationCode && !input.attachmentId) {
      throw new BadRequestException('confirmationCode 或 attachmentId 至少填一项');
    }

    if (input.attachmentId) {
      throw new BadRequestException('附件上传 M1 未就绪（501）', { cause: { status: 501 } });
    }

    const store = readReservationEvidenceStore(trip.metadata);
    const resource: PoiAccessTargetResource = input.resource ?? 'PARKING';
    const code = input.confirmationCode?.trim();

    const existingByCode =
      code &&
      store.items.find(
        (i) =>
          i.tripItemId === input.tripItemId &&
          i.confirmationCode?.trim() === code &&
          i.poiId === input.poiId,
      );

    const id = input.id ?? existingByCode?.id ?? `rev-${Date.now()}`;
    const nextItem = {
      id,
      tripItemId: input.tripItemId,
      poiId: input.poiId,
      resource,
      dateISO,
      slotStartTime,
      slotEndTime: input.slotEndTime,
      confirmationCode: code,
      attachmentId: input.attachmentId,
      createdAt: existingByCode?.createdAt ?? new Date().toISOString(),
      source: 'manual' as const,
    };

    const items = store.items.filter((i) => i.id !== id);
    items.push(nextItem);

    const evidence: TripReservationEvidenceStore = { revision: 1, items };
    const metadata = {
      ...(typeof trip.metadata === 'object' && trip.metadata ? trip.metadata : {}),
      [TRIP_RESERVATION_EVIDENCE_METADATA_KEY]: evidence,
      reservationEvidenceUpdatedBy: userId,
      reservationEvidenceUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata },
    });

    return { tripId, evidence };
  }
}

function resolveEvidenceSlot(
  trip: TripWithItems,
  input: TripReservationEvidenceInput,
): { dateISO: string; slotStartTime?: string } {
  if (input.dateISO?.trim()) {
    return {
      dateISO: input.dateISO.trim().slice(0, 10),
      slotStartTime: input.slotStartTime ?? input.plannedArrival,
    };
  }

  for (const day of trip.TripDay) {
    const item = day.ItineraryItem.find((i) => i.id === input.tripItemId);
    if (!item) continue;

    const dateISO =
      DateTime.fromJSDate(day.date).toISODate() ?? formatDateISO(day.date);
    const slotStartTime =
      input.slotStartTime ??
      input.plannedArrival ??
      (item.startTime
        ? DateTime.fromJSDate(item.startTime).toFormat('HH:mm')
        : undefined);

    return { dateISO, slotStartTime };
  }

  throw new BadRequestException(
    'dateISO 必填，或 tripItemId 需关联有效行程日（无法从行程推导访问日期）',
  );
}
