import { TRIP_FILE_CATEGORIES } from '../trip-file.constants';
import type { TripFileItemDto, TripFileStatsResponse } from '../dto/trip-file.dto';
import type {
  TripFileOverviewItem,
  TripFileOverviewQuery,
  TripFileOverviewResponse,
  TripFileOverviewSources,
} from '../dto/trip-file-overview.dto';

export type ItineraryFileSourceRow = {
  id: string;
  type: string;
  bookingStatus: string | null;
  bookingConfirmation: string | null;
  bookingUrl: string | null;
  costCategory: string | null;
  note: string | null;
  startTime: Date | null;
  tripDayId: string;
  tripDayDate: Date;
  placeName: string | null;
  placeCategory: string | null;
};

const CONFIRMED_BOOKING = new Set(['BOOKED', 'CONFIRMED', 'COMPLETED']);
const PENDING_BOOKING = new Set(['NEED_BOOKING', 'PENDING', 'UNBOOKED']);

export function categoryForItineraryItem(row: ItineraryFileSourceRow): string {
  const cost = row.costCategory?.toUpperCase() ?? '';
  if (cost === 'ACCOMMODATION') return 'booking';
  if (cost === 'TRANSPORTATION' || cost === 'TRANSPORT') return 'travel';
  if (cost === 'ACTIVITIES' || cost === 'ACTIVITY') return 'booking';
  if (cost === 'FOOD') return 'receipts';

  const placeCat = row.placeCategory?.toUpperCase() ?? '';
  if (placeCat === 'HOTEL') return 'booking';
  if (placeCat === 'TRANSIT_HUB') return 'travel';

  const type = row.type.toUpperCase();
  if (type === 'TRANSIT') return 'travel';
  if (type === 'ACTIVITY') return 'booking';
  return 'travel';
}

export function itemNeedsBookingDocument(row: ItineraryFileSourceRow): boolean {
  const cost = row.costCategory?.toUpperCase() ?? '';
  if (cost === 'ACCOMMODATION' || cost === 'TRANSPORTATION' || cost === 'ACTIVITIES') {
    return true;
  }
  const placeCat = row.placeCategory?.toUpperCase() ?? '';
  if (placeCat === 'HOTEL' || placeCat === 'TRANSIT_HUB') return true;
  const type = row.type.toUpperCase();
  if (type === 'TRANSIT' || type === 'ACTIVITY') return true;
  if (PENDING_BOOKING.has(row.bookingStatus?.toUpperCase() ?? '')) return true;
  return false;
}

export function parseEmbeddedBookingDocuments(note: string | null): Array<{
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
}> {
  if (!note?.trim()) return [];
  try {
    const parsed = JSON.parse(note) as { bookingDocuments?: unknown };
    if (!Array.isArray(parsed.bookingDocuments)) return [];
    return parsed.bookingDocuments
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') return null;
        const doc = raw as Record<string, unknown>;
        const name = String(doc.name ?? doc.title ?? doc.fileName ?? `资料 ${index + 1}`);
        return {
          id: String(doc.id ?? `doc-${index}`),
          name,
          url: doc.url ? String(doc.url) : doc.downloadUrl ? String(doc.downloadUrl) : undefined,
          mimeType: doc.mimeType ? String(doc.mimeType) : undefined,
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; url?: string; mimeType?: string }>;
  } catch {
    return [];
  }
}

function titleForItineraryRow(row: ItineraryFileSourceRow): string {
  const place = row.placeName?.trim();
  if (place) return place;
  const noteLine = row.note?.split('\n')[0]?.trim();
  if (noteLine && !noteLine.startsWith('{')) return noteLine;
  return `${row.type} 预订资料`;
}

export function buildItineraryOverviewItems(
  rows: ItineraryFileSourceRow[],
  uploadedFilesByItemId: Map<string, TripFileItemDto[]>,
): { items: TripFileOverviewItem[]; sources: Pick<TripFileOverviewSources, 'itineraryDocumentCount' | 'itineraryPendingCount' | 'itineraryLinkCount'> } {
  const items: TripFileOverviewItem[] = [];
  let itineraryDocumentCount = 0;
  let itineraryPendingCount = 0;
  let itineraryLinkCount = 0;

  for (const row of rows) {
    const linkedFiles = uploadedFilesByItemId.get(row.id) ?? [];
    const hasUploadedFile = linkedFiles.some((f) => f.status === 'UPLOADED');
    const category = categoryForItineraryItem(row);
    const base = {
      category,
      itineraryItemId: row.id,
      tripDayId: row.tripDayId,
      tripDayDate: row.tripDayDate.toISOString(),
      itemType: row.type,
      placeName: row.placeName,
      bookingStatus: row.bookingStatus,
    };

    for (const doc of parseEmbeddedBookingDocuments(row.note)) {
      itineraryDocumentCount += 1;
      items.push({
        id: `itinerary:${row.id}:doc:${doc.id}`,
        source: doc.url ? 'itinerary_link' : 'itinerary_booking',
        status: doc.url ? 'LINK' : 'REFERENCE',
        title: doc.name,
        fileName: doc.name,
        mimeType: doc.mimeType ?? null,
        fileSizeBytes: 0,
        downloadUrl: doc.url ?? null,
        bookingConfirmation: null,
        linkedTripFileIds: linkedFiles.map((f) => f.id),
        ...base,
      });
      if (doc.url) itineraryLinkCount += 1;
    }

    if (row.bookingConfirmation?.trim()) {
      itineraryDocumentCount += 1;
      items.push({
        id: `itinerary:${row.id}:confirmation`,
        source: 'itinerary_booking',
        status: 'REFERENCE',
        title: `${titleForItineraryRow(row)} · 确认号`,
        fileName: null,
        mimeType: null,
        fileSizeBytes: 0,
        bookingConfirmation: row.bookingConfirmation.trim(),
        downloadUrl: null,
        linkedTripFileIds: linkedFiles.map((f) => f.id),
        ...base,
      });
    }

    if (row.bookingUrl?.trim()) {
      itineraryLinkCount += 1;
      items.push({
        id: `itinerary:${row.id}:booking-url`,
        source: 'itinerary_link',
        status: 'LINK',
        title: `${titleForItineraryRow(row)} · 预订链接`,
        fileName: null,
        mimeType: 'text/uri-list',
        fileSizeBytes: 0,
        downloadUrl: row.bookingUrl.trim(),
        bookingConfirmation: null,
        linkedTripFileIds: linkedFiles.map((f) => f.id),
        ...base,
      });
    }

    const needsDoc = itemNeedsBookingDocument(row);
    const isConfirmed = CONFIRMED_BOOKING.has(row.bookingStatus?.toUpperCase() ?? '');
    const hasInlineDoc =
      !!row.bookingConfirmation?.trim() ||
      !!row.bookingUrl?.trim() ||
      parseEmbeddedBookingDocuments(row.note).length > 0;

    if (needsDoc && !hasUploadedFile && !hasInlineDoc && !isConfirmed) {
      itineraryPendingCount += 1;
      items.push({
        id: `itinerary:${row.id}:pending`,
        source: 'itinerary_pending',
        status: 'PENDING',
        title: `${titleForItineraryRow(row)} · 待补充凭证`,
        fileName: null,
        mimeType: null,
        fileSizeBytes: 0,
        bookingConfirmation: null,
        downloadUrl: null,
        linkedTripFileIds: [],
        description: row.bookingStatus ? `预订状态：${row.bookingStatus}` : '缺少预订凭证',
        ...base,
      });
    }
  }

  return {
    items,
    sources: { itineraryDocumentCount, itineraryPendingCount, itineraryLinkCount },
  };
}

export function mapTripFileToOverviewItem(file: TripFileItemDto): TripFileOverviewItem {
  return {
    id: file.id,
    source: 'trip_file',
    category: file.category,
    status: file.status,
    title: file.title ?? file.fileName ?? '文件',
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileSizeBytes: file.fileSizeBytes,
    description: file.description,
    expiresAt: file.expiresAt,
    itineraryItemId: file.itineraryItemId,
    uploadedByUserId: file.uploadedByUserId,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    linkedTripFileIds: [file.id],
  };
}

export function mergeOverviewStats(
  tripFiles: TripFileItemDto[],
  itineraryItems: TripFileOverviewItem[],
  storageQuotaBytes: number,
): TripFileStatsResponse {
  const now = Date.now();
  const expiringThreshold = now + 30 * 24 * 60 * 60 * 1000;

  const tripUploaded = tripFiles.filter((f) => f.status === 'UPLOADED').length;
  const tripPending = tripFiles.filter((f) => f.status === 'PENDING').length;
  const itineraryUploaded = itineraryItems.filter(
    (i) => i.source !== 'itinerary_pending' && (i.status === 'REFERENCE' || i.status === 'LINK'),
  ).length;
  const itineraryPending = itineraryItems.filter((i) => i.source === 'itinerary_pending').length;

  const storageUsedBytes = tripFiles
    .filter((f) => f.status === 'UPLOADED')
    .reduce((sum, f) => sum + f.fileSizeBytes, 0);

  const expiringSoonCount = tripFiles.filter(
    (f) =>
      f.status === 'UPLOADED' &&
      f.expiresAt &&
      Date.parse(f.expiresAt) <= expiringThreshold &&
      Date.parse(f.expiresAt) >= now,
  ).length;

  const allOverview = [
    ...tripFiles.map(mapTripFileToOverviewItem),
    ...itineraryItems,
  ];

  const countByCategory = new Map<string, number>();
  for (const item of allOverview) {
    countByCategory.set(item.category, (countByCategory.get(item.category) ?? 0) + 1);
  }

  return {
    totalCount: allOverview.length,
    uploadedCount: tripUploaded + itineraryUploaded,
    pendingCount: tripPending + itineraryPending,
    expiringSoonCount,
    storageUsedBytes,
    storageQuotaBytes,
    categories: TRIP_FILE_CATEGORIES.map((cat) => ({
      id: cat.id,
      title: cat.title,
      description: cat.description,
      count: countByCategory.get(cat.id) ?? 0,
    })),
  };
}

export function filterAndPaginateOverview(
  items: TripFileOverviewItem[],
  query: TripFileOverviewQuery,
): { items: TripFileOverviewItem[]; total: number; limit: number; offset: number } {
  let filtered = items;
  if (query.category) {
    filtered = filtered.filter((i) => i.category === query.category);
  }
  if (query.status) {
    filtered = filtered.filter((i) => i.status === query.status);
  }
  if (query.source) {
    filtered = filtered.filter((i) => i.source === query.source);
  }
  if (query.includePending === false) {
    filtered = filtered.filter((i) => i.source !== 'itinerary_pending' && i.status !== 'PENDING');
  }

  filtered = [...filtered].sort((a, b) => {
    const aTime = a.updatedAt ?? a.createdAt ?? a.tripDayDate ?? '';
    const bTime = b.updatedAt ?? b.createdAt ?? b.tripDayDate ?? '';
    return bTime.localeCompare(aTime);
  });

  const total = filtered.length;
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  return {
    items: filtered.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export function assembleOverviewResponse(input: {
  tripId: string;
  tripFiles: TripFileItemDto[];
  itineraryRows: ItineraryFileSourceRow[];
  query: TripFileOverviewQuery;
  storageQuotaBytes: number;
}): TripFileOverviewResponse {
  const uploadedByItemId = new Map<string, TripFileItemDto[]>();
  for (const file of input.tripFiles) {
    if (!file.itineraryItemId) continue;
    const list = uploadedByItemId.get(file.itineraryItemId) ?? [];
    list.push(file);
    uploadedByItemId.set(file.itineraryItemId, list);
  }

  const tripFileItems = input.tripFiles.map(mapTripFileToOverviewItem);
  const { items: itineraryItems, sources: itinerarySources } = buildItineraryOverviewItems(
    input.itineraryRows,
    uploadedByItemId,
  );

  const merged = [...tripFileItems, ...itineraryItems];
  const stats = mergeOverviewStats(input.tripFiles, itineraryItems, input.storageQuotaBytes);
  const page = filterAndPaginateOverview(merged, input.query);

  return {
    tripId: input.tripId,
    stats,
    items: page.items,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    sources: {
      tripFileCount: input.tripFiles.length,
      ...itinerarySources,
    },
    generatedAt: new Date().toISOString(),
  };
}
