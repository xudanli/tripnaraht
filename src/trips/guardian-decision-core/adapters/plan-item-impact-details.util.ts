/**
 * Resolve itinerary item labels + arrangement kinds for impact scope projection.
 * Labels come from Place / note / id only — no synthetic role copy.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import { resolvePlaceDisplayName } from '../../../places/utils/place-display-name.util';
import type { ImpactArrangementKind } from '../../../decision-runtime/gateway/frontend/impact-scope-view.types';

export interface PlanItemImpactDetail {
  itemId: string;
  dayIndex: number;
  label: string;
  arrangementKind: ImpactArrangementKind;
  hasBooking: boolean;
  placeId?: number;
}

function classifyArrangement(input: {
  type: string;
  placeCategory?: string | null;
}): ImpactArrangementKind {
  const type = input.type.toUpperCase();
  if (type === 'TRANSIT') return 'DRIVE';
  if (type === 'REST') return 'REST';
  if (type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING') return 'MEAL';
  const category = String(input.placeCategory ?? '').toUpperCase();
  if (category === 'HOTEL') return 'HOTEL';
  if (category === 'RESTAURANT') return 'MEAL';
  if (category === 'TRANSIT_HUB') return 'TRANSIT';
  if (type === 'ACTIVITY') return 'ACTIVITY';
  return 'OTHER';
}

function hasActiveBooking(bookingStatus?: string | null): boolean {
  if (!bookingStatus) return false;
  const normalized = bookingStatus.toLowerCase();
  return normalized === 'booked' || normalized === 'confirmed' || normalized === 'pending';
}

function resolveItemLabel(input: {
  itemId: string;
  note?: string | null;
  place?: { nameCN?: string | null; nameEN?: string | null } | null;
}): string {
  const fromPlace = resolvePlaceDisplayName(input.place, { fallback: '' });
  if (fromPlace) return fromPlace;
  const noteLine =
    typeof input.note === 'string' ? input.note.split('\n')[0]?.trim() : '';
  if (noteLine) return noteLine;
  return input.itemId;
}

export async function fetchPlanItemImpactDetails(
  prisma: PrismaService,
  itemIds: string[],
): Promise<PlanItemImpactDetail[]> {
  if (!itemIds.length) return [];

  const rows = await prisma.itineraryItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      type: true,
      note: true,
      placeId: true,
      bookingStatus: true,
      Place: { select: { nameCN: true, nameEN: true, category: true } },
      TripDay: {
        select: {
          id: true,
          Trip: {
            select: {
              TripDay: { select: { id: true }, orderBy: { date: 'asc' } },
            },
          },
        },
      },
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  return itemIds.map((itemId) => {
    const row = byId.get(itemId);
    if (!row) {
      return {
        itemId,
        dayIndex: 0,
        label: itemId,
        arrangementKind: 'OTHER' as const,
        hasBooking: false,
      };
    }

    const dayIds = row.TripDay?.Trip?.TripDay?.map((d) => d.id) ?? [];
    const dayIndex = Math.max(1, dayIds.indexOf(row.TripDay?.id ?? '') + 1);

    return {
      itemId,
      dayIndex,
      label: resolveItemLabel({
        itemId,
        note: row.note,
        place: row.Place,
      }),
      arrangementKind: classifyArrangement({
        type: row.type,
        placeCategory: row.Place?.category,
      }),
      hasBooking: hasActiveBooking(row.bookingStatus),
      placeId: row.placeId ?? undefined,
    };
  });
}
