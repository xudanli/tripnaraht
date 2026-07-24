import {
  assembleOverviewResponse,
  buildItineraryOverviewItems,
  categoryForItineraryItem,
  filterAndPaginateOverview,
  itemNeedsBookingDocument,
  mergeOverviewStats,
  parseEmbeddedBookingDocuments,
  type ItineraryFileSourceRow,
} from './trip-file-itinerary-sources.util';
import type { TripFileItemDto } from '../dto/trip-file.dto';
import { DEFAULT_STORAGE_QUOTA_BYTES } from '../trip-file.constants';

const baseRow = (overrides: Partial<ItineraryFileSourceRow> = {}): ItineraryFileSourceRow => ({
  id: 'item-1',
  type: 'ACTIVITY',
  bookingStatus: 'NEED_BOOKING',
  bookingConfirmation: null,
  bookingUrl: null,
  costCategory: 'ACTIVITIES',
  note: null,
  startTime: new Date('2026-08-01T10:00:00Z'),
  tripDayId: 'day-1',
  tripDayDate: new Date('2026-08-01'),
  placeName: '蓝湖',
  placeCategory: 'ATTRACTION',
  ...overrides,
});

const tripFile = (overrides: Partial<TripFileItemDto> = {}): TripFileItemDto => ({
  id: 'file-1',
  tripId: 'trip-1',
  category: 'booking',
  status: 'UPLOADED',
  fileName: 'ticket.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1024,
  title: '机票',
  description: null,
  expiresAt: null,
  itineraryItemId: 'item-1',
  uploadedByUserId: 'user-1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

describe('trip-file-itinerary-sources.util', () => {
  describe('categoryForItineraryItem', () => {
    it('maps accommodation and travel categories', () => {
      expect(categoryForItineraryItem(baseRow({ costCategory: 'ACCOMMODATION' }))).toBe('booking');
      expect(categoryForItineraryItem(baseRow({ costCategory: 'TRANSPORTATION' }))).toBe('travel');
      expect(categoryForItineraryItem(baseRow({ placeCategory: 'HOTEL', costCategory: null }))).toBe(
        'booking',
      );
    });
  });

  describe('parseEmbeddedBookingDocuments', () => {
    it('parses bookingDocuments from note JSON', () => {
      const note = JSON.stringify({
        bookingDocuments: [{ id: 'd1', name: '确认单.pdf', url: 'https://x/a.pdf' }],
      });
      expect(parseEmbeddedBookingDocuments(note)).toEqual([
        { id: 'd1', name: '确认单.pdf', url: 'https://x/a.pdf', mimeType: undefined },
      ]);
    });

    it('returns empty for invalid note', () => {
      expect(parseEmbeddedBookingDocuments('not-json')).toEqual([]);
    });
  });

  describe('buildItineraryOverviewItems', () => {
    it('creates pending placeholder when booking doc missing', () => {
      const { items, sources } = buildItineraryOverviewItems([baseRow()], new Map());
      expect(items.some((i) => i.source === 'itinerary_pending')).toBe(true);
      expect(sources.itineraryPendingCount).toBe(1);
    });

    it('skips pending when trip file linked to itinerary item', () => {
      const linked = new Map([['item-1', [tripFile()]]]);
      const { items, sources } = buildItineraryOverviewItems([baseRow()], linked);
      expect(items.some((i) => i.source === 'itinerary_pending')).toBe(false);
      expect(sources.itineraryPendingCount).toBe(0);
    });

    it('emits confirmation and booking url entries', () => {
      const row = baseRow({
        bookingStatus: 'BOOKED',
        bookingConfirmation: 'ABC123',
        bookingUrl: 'https://booking.example/abc',
      });
      const { items } = buildItineraryOverviewItems([row], new Map());
      expect(items.some((i) => i.id.endsWith(':confirmation'))).toBe(true);
      expect(items.some((i) => i.id.endsWith(':booking-url'))).toBe(true);
    });
  });

  describe('mergeOverviewStats', () => {
    it('combines trip_files and itinerary derived counts', () => {
      const tripFiles = [
        tripFile(),
        tripFile({ id: 'file-2', status: 'PENDING', fileSizeBytes: 0, itineraryItemId: null }),
      ];
      const itineraryItems = buildItineraryOverviewItems([baseRow()], new Map()).items;
      const stats = mergeOverviewStats(tripFiles, itineraryItems, DEFAULT_STORAGE_QUOTA_BYTES);
      expect(stats.uploadedCount).toBe(1);
      expect(stats.pendingCount).toBeGreaterThanOrEqual(2);
      expect(stats.totalCount).toBe(tripFiles.length + itineraryItems.length);
    });
  });

  describe('filterAndPaginateOverview', () => {
    it('filters by source and paginates', () => {
      const itineraryItems = buildItineraryOverviewItems(
        [baseRow(), baseRow({ id: 'item-2', placeName: '酒店', costCategory: 'ACCOMMODATION' })],
        new Map(),
      ).items;
      const page = filterAndPaginateOverview(itineraryItems, {
        source: 'itinerary_pending',
        limit: 1,
        offset: 0,
      });
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(1);
    });
  });

  describe('assembleOverviewResponse', () => {
    it('returns merged overview payload', () => {
      const response = assembleOverviewResponse({
        tripId: 'trip-1',
        tripFiles: [tripFile()],
        itineraryRows: [baseRow({ id: 'item-2' })],
        query: { limit: 20 },
        storageQuotaBytes: DEFAULT_STORAGE_QUOTA_BYTES,
      });
      expect(response.tripId).toBe('trip-1');
      expect(response.stats.totalCount).toBeGreaterThan(0);
      expect(response.sources.tripFileCount).toBe(1);
      expect(response.generatedAt).toBeTruthy();
    });
  });

  describe('itemNeedsBookingDocument', () => {
    it('detects items that require vouchers', () => {
      expect(itemNeedsBookingDocument(baseRow({ costCategory: 'ACCOMMODATION' }))).toBe(true);
      expect(itemNeedsBookingDocument(baseRow({ type: 'TRANSIT', costCategory: null }))).toBe(true);
      expect(itemNeedsBookingDocument(baseRow({ costCategory: 'OTHER', type: 'REST', bookingStatus: null }))).toBe(
        false,
      );
    });
  });
});
