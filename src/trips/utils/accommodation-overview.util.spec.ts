import {
  buildAccommodationNightCard,
  buildAccommodationReminders,
  computeAccommodationStats,
  computeCrossDayInfo,
  computeTravelSummary,
  isAccommodationItem,
  parseAlternatives,
  parseItemMetadataFromNote,
  type AccommodationItemRow,
} from './accommodation-overview.util';

const baseRow = (overrides: Partial<AccommodationItemRow> = {}): AccommodationItemRow => ({
  id: 'item-1',
  type: 'REST',
  tripDayId: 'day-1',
  tripDayDate: new Date('2026-08-01'),
  dayNumber: 1,
  startTime: new Date('2026-08-01T20:00:00Z'),
  endTime: new Date('2026-08-02T10:00:00Z'),
  bookingStatus: 'NEED_BOOKING',
  bookingConfirmation: null,
  bookingUrl: null,
  bookedAt: null,
  costCategory: 'ACCOMMODATION',
  estimatedCost: 1200,
  actualCost: null,
  currency: 'CNY',
  note: null,
  placeId: 1,
  placeNameCN: '蓝湖酒店',
  placeNameEN: 'Blue Lagoon Hotel',
  placeCategory: 'HOTEL',
  placeAddress: '冰岛',
  placeRating: 4.5,
  placeMetadata: { photoUrl: 'https://example.com/h.jpg', tags: ['温泉'] },
  travelFromPreviousDuration: 90,
  travelFromPreviousDistance: 80_000,
  travelMode: 'DRIVE',
  ...overrides,
});

describe('accommodation-overview.util', () => {
  describe('isAccommodationItem', () => {
    it('detects hotel by place category and REST note', () => {
      expect(isAccommodationItem(baseRow())).toBe(true);
      expect(
        isAccommodationItem(
          baseRow({
            costCategory: null,
            placeCategory: null,
            placeNameCN: null,
            type: 'REST',
            note: '雷克雅未克民宿\n地址: xxx',
          }),
        ),
      ).toBe(true);
      expect(
        isAccommodationItem(
          baseRow({
            costCategory: 'FOOD',
            placeCategory: 'RESTAURANT',
            type: 'MEAL_ANCHOR',
            placeNameCN: '本地餐厅',
            placeNameEN: 'Local Restaurant',
          }),
        ),
      ).toBe(false);
    });
  });

  describe('computeCrossDayInfo', () => {
    it('marks multi-night stay as checkin', () => {
      const info = computeCrossDayInfo(baseRow());
      expect(info.isCrossDay).toBe(true);
      expect(info.displayMode).toBe('checkin');
    });

    it('marks checkout items', () => {
      const info = computeCrossDayInfo(baseRow({ isCheckoutItem: true }));
      expect(info.displayMode).toBe('checkout');
    });
  });

  describe('parseAlternatives', () => {
    it('parses accommodationAlternatives from metadata', () => {
      const meta = {
        accommodationAlternatives: [{ id: 'a1', name: '备选酒店', priceHint: '¥800' }],
        roomType: '双床房',
        roomCount: 1,
      };
      expect(parseAlternatives(meta)).toHaveLength(1);
      expect(parseAlternatives(meta)[0].name).toBe('备选酒店');
    });
  });

  describe('buildAccommodationNightCard', () => {
    it('builds card with booking docs and travel info', () => {
      const row = baseRow({
        note: JSON.stringify({
          bookingDocuments: [{ id: 'd1', name: '确认单.pdf' }],
          roomType: '大床房',
          roomCount: 2,
        }),
        bookingConfirmation: 'ABC123',
      });
      const card = buildAccommodationNightCard(row, ['file-1'], [
        { id: 'file-1', name: 'hotel.pdf', source: 'trip_file' },
      ]);
      expect(card.name).toBe('蓝湖酒店');
      expect(card.roomType).toBe('大床房');
      expect(card.roomCount).toBe(2);
      expect(card.bookingDocuments.length).toBeGreaterThanOrEqual(2);
      expect(card.travelToAccommodation?.isLongSegment).toBe(false);
    });
  });

  describe('computeAccommodationStats', () => {
    it('counts booked and pending nights', () => {
      const nights = [
        buildAccommodationNightCard(baseRow({ bookingStatus: 'BOOKED' }), [], []),
        buildAccommodationNightCard(
          baseRow({ id: 'item-2', bookingStatus: 'NEED_BOOKING' }),
          [],
          [],
        ),
      ];
      const stats = computeAccommodationStats(nights);
      expect(stats.totalNights).toBe(2);
      expect(stats.bookedCount).toBe(1);
      expect(stats.needBookingCount).toBe(1);
    });
  });

  describe('buildAccommodationReminders', () => {
    it('creates need_booking and long_travel reminders', () => {
      const card = buildAccommodationNightCard(
        baseRow({
          travelFromPreviousDuration: 180,
          travelFromPreviousDistance: 300_000,
        }),
        [],
        [],
      );
      const reminders = buildAccommodationReminders([card]);
      expect(reminders.some((r) => r.type === 'need_booking')).toBe(true);
      expect(reminders.some((r) => r.type === 'long_travel')).toBe(true);
    });
  });

  describe('computeTravelSummary', () => {
    it('aggregates travel segments', () => {
      const card = buildAccommodationNightCard(
        baseRow({ travelFromPreviousDuration: 60, travelFromPreviousDistance: 50_000 }),
        [],
        [],
      );
      const summary = computeTravelSummary([card]);
      expect(summary.totalDuration).toBe(60);
      expect(summary.totalDistance).toBe(50_000);
    });
  });

  describe('parseItemMetadataFromNote', () => {
    it('parses JSON note metadata', () => {
      const meta = parseItemMetadataFromNote(JSON.stringify({ roomType: 'Suite' }));
      expect(meta.roomType).toBe('Suite');
    });
  });
});
