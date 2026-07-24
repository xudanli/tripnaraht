/**
 * 从行程 hard_booking 节点与交通插件提醒聚合 booking_priority_list@v1。
 */

import type { Itinerary, ItineraryItem } from '../../interfaces/trip-plan.interface';
import type { PoiPitfallCard } from '../../utils/poi-pitfall-insight.util';
import type {
  BookingPriorityCategory,
  BookingPriorityItem,
  BookingPriorityList,
  BookingPriorityUrgency,
} from '../types/booking-priority-list.type';
import { BOOKING_PRIORITY_LIST_SCHEMA } from '../types/booking-priority-list.type';

type TransportReminderLike = {
  mode?: string;
  title?: string;
  description?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical' | string;
  timeWindow?: {
    recommendedDaysAhead?: number;
    bookingDeadline?: string;
  };
  bookingInfo?: {
    bookingLink?: string;
  };
};

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function urgencyFromTransport(raw?: string): BookingPriorityUrgency {
  const u = String(raw ?? '').toLowerCase();
  if (u === 'critical') return 'CRITICAL';
  if (u === 'high') return 'HIGH';
  return 'MEDIUM';
}

function urgencyFromLeadDays(leadDays: number): BookingPriorityUrgency {
  if (leadDays <= 3) return 'CRITICAL';
  if (leadDays <= 14) return 'HIGH';
  return 'MEDIUM';
}

function countdownSeconds(targetIso: string, generatedAtMs: number): number {
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return 0;
  return Math.max(0, Math.floor((targetMs - generatedAtMs) / 1000));
}

function buildCalendarReminderDeeplink(
  tripId: string,
  bookingId: string,
  title: string,
  opensAt?: string,
  bookBy?: string,
): string {
  const params = new URLSearchParams({
    action: 'calendar_reminder',
    booking_id: bookingId,
  });
  if (opensAt) params.set('opens_at', opensAt);
  if (bookBy) params.set('book_by', bookBy);
  if (title) params.set('title', title.slice(0, 120));
  return `/dashboard/trips/${tripId}?${params.toString()}`;
}

function inferCategory(
  item: ItineraryItem,
): 'ATTRACTION_TICKET' | 'TRANSPORT_FLIGHT' | 'SPECIAL_EXPERIENCE' {
  const type = String(item.type ?? '').toUpperCase();
  if (type === 'DINNER' || type === 'SPECIAL' || type === 'EXPERIENCE') return 'SPECIAL_EXPERIENCE';
  if (type === 'TRANSIT' || type === 'FLIGHT' || type === 'FERRY' || type === 'TRANSFER') {
    return 'TRANSPORT_FLIGHT';
  }
  return 'ATTRACTION_TICKET';
}

function inferTransportCategory(
  mode?: string,
): 'ATTRACTION_TICKET' | 'TRANSPORT_FLIGHT' | 'SPECIAL_EXPERIENCE' {
  const m = String(mode ?? '').toLowerCase();
  if (m === 'flight' || m === 'ferry' || m === 'boat' || m === 'rail' || m === 'bus') {
    return 'TRANSPORT_FLIGHT';
  }
  return 'SPECIAL_EXPERIENCE';
}

function pitfallHtmlForItem(
  item: ItineraryItem,
  dayIndex: number,
  pitfallCards?: PoiPitfallCard[],
): string | undefined {
  if (!pitfallCards?.length) return undefined;
  const poiId = item.location_ref?.place_id ?? item.id;
  const card = pitfallCards.find(
    (c) =>
      c.poi_id === poiId ||
      c.place_id === poiId ||
      (c.day_index === dayIndex && c.label_zh === item.location_ref?.name),
  );
  if (!card?.tips_zh?.length) return undefined;
  return card.tips_zh.map((t) => `<p>${t}</p>`).join('');
}

function resolveBookByDate(item: ItineraryItem, dayDate?: string): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const fromMeta =
    pickStr(meta, [
      'book_by_date',
      'bookByDate',
      'booking_deadline',
      'bookingDeadline',
      'latest_arrival_time',
      'latest_arrival_time_iso',
    ]) ?? pickStr(meta, ['booking_window_end_iso']);
  if (fromMeta) return fromMeta;
  if (dayDate) return dayDate;
  const start = item.start_window;
  if (typeof start === 'string' && start.trim()) return start;
  return new Date().toISOString();
}

function resolveOpensAtLocal(item: ItineraryItem): string | undefined {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  return pickStr(meta, ['opens_at_local', 'opensAtLocal', 'ticket_opens_at', 'booking_opens_at']);
}

function resolveOfficialUrl(item: ItineraryItem): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  return (
    pickStr(meta, [
      'official_booking_url',
      'officialBookingUrl',
      'booking_url',
      'bookingUrl',
      'ticket_url',
    ]) ?? '#'
  );
}

function itemFromHardBooking(params: {
  item: ItineraryItem;
  dayIndex: number;
  dayDate?: string;
  tripId: string;
  generatedAtMs: number;
  pitfallCards?: PoiPitfallCard[];
}): BookingPriorityItem | null {
  const { item, dayIndex, dayDate, tripId, generatedAtMs, pitfallCards } = params;
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const isHard =
    Boolean(meta.hard_booking) === true || String(item.type ?? '').toUpperCase() === 'HARD_BOOKING';
  if (!isHard) return null;

  const id = String(item.id ?? `hb_day${dayIndex}_${item.location_ref?.place_id ?? 'item'}`);
  const label = item.location_ref?.name?.trim() || String(item.type ?? '预订节点');
  const bookByDate = resolveBookByDate(item, dayDate);
  const opensAtLocal = resolveOpensAtLocal(item);
  const countdownTarget = opensAtLocal ?? bookByDate;
  const leadDays = Math.ceil(
    (Date.parse(bookByDate) - generatedAtMs) / (24 * 60 * 60 * 1000),
  );

  return {
    id,
    category: inferCategory(item),
    title: `${label}预约`,
    associatedDayNumber: dayIndex,
    urgencyLevel: urgencyFromLeadDays(Number.isFinite(leadDays) ? leadDays : 30),
    timing: {
      bookByDate,
      ...(opensAtLocal ? { opensAtLocal } : {}),
      countdownSeconds: countdownSeconds(countdownTarget, generatedAtMs),
    },
    actionPayload: {
      officialBookingUrl: resolveOfficialUrl(item),
      ...(pitfallHtmlForItem(item, dayIndex, pitfallCards)
        ? { bookingGuideHtml: pitfallHtmlForItem(item, dayIndex, pitfallCards) }
        : {}),
      calendarReminderDeeplink: buildCalendarReminderDeeplink(
        tripId,
        id,
        `${label}预约`,
        opensAtLocal,
        bookByDate,
      ),
    },
  };
}

function itemFromTransportReminder(params: {
  reminder: TransportReminderLike;
  tripId: string;
  generatedAtMs: number;
  dayNumber: number;
  index: number;
}): BookingPriorityItem {
  const { reminder, tripId, generatedAtMs, dayNumber, index } = params;
  const bookByDate =
    reminder.timeWindow?.bookingDeadline ??
    new Date(generatedAtMs + (reminder.timeWindow?.recommendedDaysAhead ?? 14) * 24 * 60 * 60 * 1000).toISOString();
  const id = `transport_reminder_${index}_${String(reminder.mode ?? 'mode')}`;
  const title = reminder.title?.trim() || `交通预订 · ${reminder.mode ?? 'transport'}`;

  return {
    id,
    category: inferTransportCategory(reminder.mode),
    title,
    associatedDayNumber: dayNumber,
    urgencyLevel: urgencyFromTransport(reminder.urgency),
    timing: {
      bookByDate,
      countdownSeconds: countdownSeconds(bookByDate, generatedAtMs),
    },
    actionPayload: {
      officialBookingUrl: reminder.bookingInfo?.bookingLink?.trim() || '#',
      ...(reminder.description?.trim()
        ? { bookingGuideHtml: `<p>${reminder.description.trim()}</p>` }
        : {}),
      calendarReminderDeeplink: buildCalendarReminderDeeplink(tripId, id, title, undefined, bookByDate),
    },
  };
}

function extractTransportReminders(researchData?: Record<string, unknown> | null): TransportReminderLike[] {
  if (!researchData || typeof researchData !== 'object') return [];
  const checklist =
    (researchData.transportChecklist as { reminders?: TransportReminderLike[] } | undefined) ??
    (researchData.transport_checklist as { reminders?: TransportReminderLike[] } | undefined);
  if (checklist?.reminders?.length) return checklist.reminders;
  const flat = researchData.transport_reminders;
  return Array.isArray(flat) ? (flat as TransportReminderLike[]) : [];
}

export function buildBookingPriorityList(input: {
  tripId: string;
  itinerary?: Itinerary | null;
  researchData?: Record<string, unknown> | null;
  poiPitfallCards?: PoiPitfallCard[] | null;
  generatedAt?: string;
}): BookingPriorityList | undefined {
  const tripId = input.tripId?.trim();
  if (!tripId) return undefined;

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const generatedAtMs = Date.parse(generatedAt);
  const items: BookingPriorityItem[] = [];
  const pitfallCards = input.poiPitfallCards ?? undefined;

  const itinerary = input.itinerary;
  if (itinerary?.days?.length) {
    for (let di = 0; di < itinerary.days.length; di++) {
      const day = itinerary.days[di];
      const dayIndex = di + 1;
      for (const raw of day.items ?? []) {
        const built = itemFromHardBooking({
          item: raw,
          dayIndex,
          dayDate: day.date,
          tripId,
          generatedAtMs,
          pitfallCards,
        });
        if (built) items.push(built);
      }
    }
  }

  const transportReminders = extractTransportReminders(input.researchData);
  for (let i = 0; i < transportReminders.length; i++) {
    items.push(
      itemFromTransportReminder({
        reminder: transportReminders[i],
        tripId,
        generatedAtMs,
        dayNumber: 1,
        index: i,
      }),
    );
  }

  if (!items.length) return undefined;

  const urgencyRank: Record<BookingPriorityUrgency, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
  };
  items.sort(
    (a, b) =>
      urgencyRank[a.urgencyLevel] - urgencyRank[b.urgencyLevel] ||
      a.timing.countdownSeconds - b.timing.countdownSeconds,
  );

  return {
    schema: BOOKING_PRIORITY_LIST_SCHEMA,
    tripId,
    generatedAt,
    items,
  };
}
