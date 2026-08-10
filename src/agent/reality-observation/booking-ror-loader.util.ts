/**
 * 从行程项预订状态推导 booking.fixedCommitments / booking.availability。
 * P0 不做第三方实时库存；可订性来自本地 bookingStatus + 是否需预订。
 */

export type RorBookingItemStatus = {
  id: string;
  title?: string;
  bookingStatus?: string | null;
  needsBooking: boolean;
  isFixed: boolean;
  availability: 'BOOKED' | 'HOLD' | 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
};

export type RorBookingAvailability = {
  status: 'BOOKED' | 'HOLD' | 'AVAILABLE' | 'MIXED' | 'UNAVAILABLE' | 'UNKNOWN';
  items: RorBookingItemStatus[];
  fixedCount: number;
  openCount: number;
  provider: 'ITINERARY_BOOKING_STATUS';
  observedAt: string;
};

const FIXED_RE = /confirm|paid|booked|HOLD|held/i;
const UNAVAIL_RE = /cancel|sold.?out|unavailable|fail/i;
const HOLD_RE = /hold|pending|reserved/i;

function classifyStatus(
  bookingStatus: string | null | undefined,
  needsBooking: boolean,
): RorBookingItemStatus['availability'] {
  const s = String(bookingStatus ?? '');
  if (!s.trim()) return needsBooking ? 'UNKNOWN' : 'AVAILABLE';
  if (UNAVAIL_RE.test(s)) return 'UNAVAILABLE';
  if (/confirm|paid|booked/i.test(s)) return 'BOOKED';
  if (HOLD_RE.test(s)) return 'HOLD';
  if (/available|open|ok/i.test(s)) return 'AVAILABLE';
  return 'UNKNOWN';
}

export function deriveBookingFactsFromDayItems(
  items: Array<{
    id: string;
    title?: string;
    bookingStatus?: string | null;
    type?: string | null;
    needsBooking?: boolean;
    ExperienceDefinition?: { requiresGuide?: boolean | null; requiresLicense?: boolean | null } | null;
  }>,
): {
  'booking.fixedCommitments': Array<Record<string, unknown>>;
  'booking.availability': RorBookingAvailability;
} {
  const observedAt = new Date().toISOString();
  const statuses: RorBookingItemStatus[] = [];
  const fixed: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const type = String(item.type ?? '').toUpperCase();
    if (type.includes('REST') || type.includes('HOTEL') || type.includes('ACCOM')) {
      // 住宿也算固定锚点候选
    }
    const needsBooking =
      item.needsBooking === true ||
      item.ExperienceDefinition?.requiresGuide === true ||
      item.ExperienceDefinition?.requiresLicense === true ||
      !!String(item.bookingStatus ?? '').trim();

    const availability = classifyStatus(item.bookingStatus, needsBooking);
    const isFixed = FIXED_RE.test(String(item.bookingStatus ?? ''));
    statuses.push({
      id: item.id,
      title: item.title,
      bookingStatus: item.bookingStatus ?? null,
      needsBooking,
      isFixed,
      availability,
    });
    if (isFixed) {
      fixed.push({
        id: item.id,
        title: item.title,
        bookingStatus: item.bookingStatus,
        availability,
      });
    }
  }

  const relevant = statuses.filter((s) => s.needsBooking || s.isFixed);
  const pool = relevant.length ? relevant : statuses;
  const uniq = new Set(pool.map((s) => s.availability));
  let status: RorBookingAvailability['status'] = 'UNKNOWN';
  if (!pool.length) {
    status = 'UNKNOWN';
  } else if (uniq.size === 1) {
    status = [...uniq][0] as RorBookingAvailability['status'];
  } else if (pool.every((s) => s.availability === 'BOOKED' || s.availability === 'HOLD')) {
    status = 'HOLD';
  } else if (pool.some((s) => s.availability === 'UNAVAILABLE')) {
    status = 'MIXED';
  } else {
    status = 'MIXED';
  }

  return {
    'booking.fixedCommitments': fixed,
    'booking.availability': {
      status,
      items: statuses,
      fixedCount: fixed.length,
      openCount: statuses.filter(
        (s) => s.needsBooking && (s.availability === 'UNKNOWN' || s.availability === 'AVAILABLE'),
      ).length,
      provider: 'ITINERARY_BOOKING_STATUS',
      observedAt,
    },
  };
}
