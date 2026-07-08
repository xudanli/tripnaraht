import { DateTime } from 'luxon';
import type {
  AccommodationAlternativeDto,
  AccommodationBookingDocumentDto,
  AccommodationNightCardDto,
  AccommodationOverviewStatsDto,
  AccommodationReminderDto,
  AccommodationTravelSummaryDto,
} from '../dto/accommodation-overview.dto';
import { parseEmbeddedBookingDocuments } from '../trip-files/utils/trip-file-itinerary-sources.util';

export const LONG_TRAVEL_DURATION_MINUTES = 120;
export const LONG_TRAVEL_DISTANCE_METERS = 250_000;

const BOOKED_STATUSES = new Set(['BOOKED', 'CONFIRMED', 'COMPLETED']);
const NEED_BOOKING_STATUSES = new Set(['NEED_BOOKING', 'PENDING', 'UNBOOKED', 'NO_BOOKING']);

export type AccommodationItemRow = {
  id: string;
  type: string;
  tripDayId: string;
  tripDayDate: Date;
  dayNumber: number;
  startTime: Date | null;
  endTime: Date | null;
  bookingStatus: string | null;
  bookingConfirmation: string | null;
  bookingUrl: string | null;
  bookedAt: Date | null;
  costCategory: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  currency: string | null;
  note: string | null;
  placeId: number | null;
  placeNameCN: string | null;
  placeNameEN: string | null;
  placeCategory: string | null;
  placeAddress: string | null;
  placeRating: number | null;
  placeMetadata: Record<string, unknown> | null;
  travelFromPreviousDuration: number | null;
  travelFromPreviousDistance: number | null;
  travelMode: string | null;
  isCheckoutItem?: boolean;
};

export function parseAccommodationOverviewInclude(raw?: string): Set<string> {
  const defaults = ['stats', 'nights', 'reminders', 'travel', 'files'];
  if (!raw?.trim()) return new Set(defaults);
  const out = new Set<string>();
  for (const part of raw.split(',')) {
    const token = part.trim().toLowerCase();
    if (token) out.add(token);
  }
  return out.size > 0 ? out : new Set(defaults);
}

export function parseItemMetadataFromNote(note: string | null): Record<string, unknown> {
  if (!note?.trim()) return {};
  try {
    const parsed = JSON.parse(note) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // plain-text note
  }
  return {};
}

const HOTEL_NAME_PATTERN = /酒店|旅馆|民宿|hotel|hostel|resort|guesthouse|inn/i;

export function isAccommodationItem(row: Pick<
  AccommodationItemRow,
  'type' | 'costCategory' | 'placeCategory' | 'note' | 'placeNameCN' | 'placeNameEN'
>): boolean {
  if (row.costCategory?.toUpperCase() === 'ACCOMMODATION') return true;
  const placeCat = row.placeCategory?.toUpperCase() ?? '';
  if (placeCat === 'HOTEL') return true;

  const name = `${row.placeNameCN ?? ''} ${row.placeNameEN ?? ''}`.trim();
  if (name && HOTEL_NAME_PATTERN.test(name)) return true;

  if (row.type.toUpperCase() === 'REST') {
    const note = row.note?.trim() ?? '';
    if (note && !note.startsWith('{') && note !== '酒店/住宿' && note !== 'Airbnb 民宿') {
      return true;
    }
    if (note && HOTEL_NAME_PATTERN.test(note)) return true;
  }

  return false;
}

export function computeCrossDayInfo(
  item: Pick<AccommodationItemRow, 'startTime' | 'endTime' | 'type' | 'isCheckoutItem'>,
): AccommodationNightCardDto['crossDayInfo'] {
  const isCheckoutItem = item.isCheckoutItem === true;
  if (!item.startTime || !item.endTime) {
    return {
      isCrossDay: false,
      crossDays: 0,
      isCheckoutItem,
      displayMode: isCheckoutItem ? 'checkout' : 'normal',
      timeLabels: timeLabelsForType(item.type, isCheckoutItem),
    };
  }

  const startDate = DateTime.fromJSDate(item.startTime, { zone: 'utc' });
  const endDate = DateTime.fromJSDate(item.endTime, { zone: 'utc' });
  const crossDays = Math.floor(
    endDate.startOf('day').diff(startDate.startOf('day'), 'days').days,
  );
  const isCrossDay = crossDays > 0;

  return {
    isCrossDay,
    crossDays: Math.max(crossDays, 0),
    isCheckoutItem,
    displayMode: isCheckoutItem ? 'checkout' : isCrossDay ? 'checkin' : 'normal',
    timeLabels: timeLabelsForType(item.type, isCheckoutItem),
  };
}

function timeLabelsForType(itemType: string, isCheckoutItem: boolean): { start: string; end: string } {
  if (isCheckoutItem) return { start: '退房时间', end: '' };
  switch (itemType.toUpperCase()) {
    case 'REST':
      return { start: '入住时间', end: '退房时间' };
    default:
      return { start: '开始时间', end: '结束时间' };
  }
}

export function extractPlacePhotoUrl(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  for (const key of ['photoUrl', 'imageUrl', 'coverUrl', 'thumbnailUrl']) {
    const val = metadata[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  const photos = metadata.photos;
  if (Array.isArray(photos) && typeof photos[0] === 'string') return photos[0];
  return null;
}

export function extractPlaceTags(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const tags = metadata.tags;
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t)).filter(Boolean);
  }
  return [];
}

export function parseAlternatives(metadata: Record<string, unknown>): AccommodationAlternativeDto[] {
  const raw = metadata.accommodationAlternatives;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const alt = entry as Record<string, unknown>;
      const name = String(alt.name ?? alt.title ?? alt.hotelName ?? `备选 ${index + 1}`);
      return {
        id: String(alt.id ?? `alt-${index}`),
        name,
        placeId: typeof alt.placeId === 'number' ? alt.placeId : null,
        priceHint: alt.priceHint ? String(alt.priceHint) : alt.price ? String(alt.price) : null,
        url: alt.url ? String(alt.url) : alt.bookingUrl ? String(alt.bookingUrl) : null,
      };
    })
    .filter(Boolean) as AccommodationAlternativeDto[];
}

export function buildBookingDocuments(
  row: AccommodationItemRow,
  linkedFileDocs: AccommodationBookingDocumentDto[],
): AccommodationBookingDocumentDto[] {
  const docs: AccommodationBookingDocumentDto[] = [...linkedFileDocs];
  const meta = parseItemMetadataFromNote(row.note);

  for (const doc of parseEmbeddedBookingDocuments(row.note)) {
    docs.push({
      id: doc.id,
      name: doc.name,
      url: doc.url,
      mimeType: doc.mimeType,
      source: 'note',
    });
  }

  const metaDocs = meta.bookingDocuments;
  if (Array.isArray(metaDocs)) {
    metaDocs.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') return;
      const doc = raw as Record<string, unknown>;
      docs.push({
        id: String(doc.id ?? `meta-doc-${index}`),
        name: String(doc.name ?? doc.title ?? `资料 ${index + 1}`),
        url: doc.url ? String(doc.url) : undefined,
        mimeType: doc.mimeType ? String(doc.mimeType) : undefined,
        source: 'note',
      });
    });
  }

  if (row.bookingConfirmation?.trim()) {
    docs.push({
      id: `${row.id}:confirmation`,
      name: '确认号',
      source: 'confirmation',
    });
  }

  const seen = new Set<string>();
  return docs.filter((d) => {
    const key = `${d.id}:${d.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function itemNeedsBooking(row: AccommodationItemRow): boolean {
  const status = row.bookingStatus?.toUpperCase() ?? '';
  if (NEED_BOOKING_STATUSES.has(status)) return true;
  if (BOOKED_STATUSES.has(status)) return false;
  return isAccommodationItem(row);
}

export function itemMissingDocument(
  row: AccommodationItemRow,
  docs: AccommodationBookingDocumentDto[],
): boolean {
  if (!itemNeedsBooking(row)) return false;
  const status = row.bookingStatus?.toUpperCase() ?? '';
  if (BOOKED_STATUSES.has(status) && docs.length === 0 && !row.bookingConfirmation?.trim()) {
    return true;
  }
  if (itemNeedsBooking(row) && docs.length === 0 && !row.bookingConfirmation?.trim() && !row.bookingUrl?.trim()) {
    return true;
  }
  return false;
}

export function buildTravelToAccommodation(
  row: AccommodationItemRow,
): AccommodationNightCardDto['travelToAccommodation'] | undefined {
  if (
    row.travelFromPreviousDuration == null &&
    row.travelFromPreviousDistance == null
  ) {
    return undefined;
  }

  const durationMinutes = row.travelFromPreviousDuration;
  const distanceMeters = row.travelFromPreviousDistance;
  const isLongSegment =
    (durationMinutes != null && durationMinutes >= LONG_TRAVEL_DURATION_MINUTES) ||
    (distanceMeters != null && distanceMeters >= LONG_TRAVEL_DISTANCE_METERS);

  return {
    durationMinutes,
    distanceMeters,
    travelMode: row.travelMode,
    fromLabel: '上一站',
    isLongSegment,
  };
}

export function buildAccommodationNightCard(
  row: AccommodationItemRow,
  linkedTripFileIds: string[],
  linkedFileDocs: AccommodationBookingDocumentDto[],
): AccommodationNightCardDto {
  const meta = parseItemMetadataFromNote(row.note);
  const placeMeta = row.placeMetadata ?? {};
  const crossDayInfo = computeCrossDayInfo(row);
  const bookingDocuments = buildBookingDocuments(row, linkedFileDocs);
  const photoUrl = extractPlacePhotoUrl(placeMeta);
  const imageUrl =
    typeof placeMeta.imageUrl === 'string' ? placeMeta.imageUrl : photoUrl;

  let coordinates: { lat: number; lng: number } | null = null;
  const coords = placeMeta.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    coordinates = { lng: Number(coords[0]), lat: Number(coords[1]) };
  } else if (
    typeof placeMeta.lat === 'number' &&
    typeof placeMeta.lng === 'number'
  ) {
    coordinates = { lat: placeMeta.lat, lng: placeMeta.lng };
  }

  const name =
    row.placeNameCN?.trim() ||
    row.placeNameEN?.trim() ||
    (typeof row.note === 'string' && !row.note.startsWith('{')
      ? row.note.split('\n')[0]?.trim()
      : undefined) ||
    '住宿';

  return {
    id: row.id,
    tripDayId: row.tripDayId,
    date: DateTime.fromJSDate(row.tripDayDate, { zone: 'utc' }).toISODate() ?? '',
    dayNumber: row.dayNumber,
    displayMode: crossDayInfo.displayMode,
    name,
    placeId: row.placeId,
    place: {
      nameCN: row.placeNameCN,
      nameEN: row.placeNameEN,
      category: row.placeCategory,
      address: row.placeAddress,
      photoUrl,
      imageUrl: imageUrl ?? null,
      tags: extractPlaceTags(placeMeta),
      rating: row.placeRating,
      coordinates,
    },
    booking: {
      status: row.bookingStatus,
      confirmation: row.bookingConfirmation,
      url: row.bookingUrl,
      bookedAt: row.bookedAt?.toISOString() ?? null,
    },
    roomType: meta.roomType ? String(meta.roomType) : null,
    roomCount: typeof meta.roomCount === 'number' ? meta.roomCount : null,
    crossDayInfo,
    alternatives: parseAlternatives(meta),
    bookingDocuments,
    linkedTripFileIds,
    travelToAccommodation: buildTravelToAccommodation(row),
    estimatedCost: row.actualCost ?? row.estimatedCost,
    currency: row.currency,
    startTime: row.startTime?.toISOString() ?? null,
    endTime: row.endTime?.toISOString() ?? null,
  };
}

export function computeAccommodationStats(
  nights: AccommodationNightCardDto[],
): AccommodationOverviewStatsDto {
  const checkinNights = nights.filter((n) => n.displayMode !== 'checkout');
  let bookedCount = 0;
  let needBookingCount = 0;
  let missingDocumentCount = 0;

  for (const night of checkinNights) {
    const status = night.booking.status?.toUpperCase() ?? '';
    if (BOOKED_STATUSES.has(status)) {
      bookedCount += 1;
    } else if (NEED_BOOKING_STATUSES.has(status) || !status) {
      needBookingCount += 1;
    }

    const hasDoc =
      night.bookingDocuments.length > 0 ||
      !!night.booking.confirmation?.trim() ||
      !!night.booking.url?.trim();
    if ((NEED_BOOKING_STATUSES.has(status) || !status) && !hasDoc) {
      missingDocumentCount += 1;
    }
  }

  return {
    totalNights: checkinNights.length,
    bookedCount,
    needBookingCount,
    missingDocumentCount,
    checkoutDaysCount: nights.filter((n) => n.displayMode === 'checkout').length,
  };
}

export function buildAccommodationReminders(
  nights: AccommodationNightCardDto[],
): AccommodationReminderDto[] {
  const reminders: AccommodationReminderDto[] = [];

  for (const night of nights) {
    const status = night.booking.status?.toUpperCase() ?? '';
    if (NEED_BOOKING_STATUSES.has(status) || (!status && night.displayMode !== 'checkout')) {
      reminders.push({
        type: 'need_booking',
        severity: 'warning',
        itineraryItemId: night.id,
        tripDayId: night.tripDayId,
        date: night.date,
        title: `${night.name} · 待预订`,
        message: status ? `预订状态：${night.booking.status}` : '尚未填写预订状态',
      });
    }

    const hasDoc =
      night.bookingDocuments.length > 0 ||
      !!night.booking.confirmation?.trim() ||
      !!night.booking.url?.trim();
    if (
      night.displayMode !== 'checkout' &&
      (BOOKED_STATUSES.has(status) || status) &&
      !hasDoc
    ) {
      reminders.push({
        type: 'missing_document',
        severity: 'warning',
        itineraryItemId: night.id,
        tripDayId: night.tripDayId,
        date: night.date,
        title: `${night.name} · 缺预订凭证`,
        message: '请上传确认单或填写确认号',
      });
    }

    if (night.travelToAccommodation?.isLongSegment) {
      const dur = night.travelToAccommodation.durationMinutes;
      reminders.push({
        type: 'long_travel',
        severity: 'info',
        itineraryItemId: night.id,
        tripDayId: night.tripDayId,
        date: night.date,
        title: `${night.name} · 路途较长`,
        message: dur
          ? `前往住宿约 ${Math.round(dur)} 分钟，请预留充足时间`
          : '前往住宿路程较长，请预留充足时间',
      });
    }

    if (night.displayMode === 'checkout') {
      reminders.push({
        type: 'checkout',
        severity: 'info',
        itineraryItemId: night.id,
        tripDayId: night.tripDayId,
        date: night.date,
        title: `${night.name} · 退房`,
        message: '今日需办理退房',
      });
    }
  }

  return reminders;
}

export function computeTravelSummary(
  nights: AccommodationNightCardDto[],
): AccommodationTravelSummaryDto {
  let totalDistance = 0;
  let totalDuration = 0;
  let longSegmentCount = 0;

  for (const night of nights) {
    const travel = night.travelToAccommodation;
    if (!travel) continue;
    if (travel.distanceMeters != null) totalDistance += travel.distanceMeters;
    if (travel.durationMinutes != null) totalDuration += travel.durationMinutes;
    if (travel.isLongSegment) longSegmentCount += 1;
  }

  return { totalDistance, totalDuration, longSegmentCount };
}
