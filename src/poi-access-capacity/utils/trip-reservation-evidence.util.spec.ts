import {
  formatDateISO,
  normalizeTripReservationEvidenceInput,
} from './trip-reservation-evidence.util';

describe('trip-reservation-evidence.util', () => {
  describe('normalizeTripReservationEvidenceInput', () => {
    it('maps parkingReservationRef to confirmationCode', () => {
      const normalized = normalizeTripReservationEvidenceInput({
        tripItemId: 'item-1',
        poiId: 'is.landmannalaugar',
        parkingReservationRef: 'PARKA-123',
      });
      expect(normalized.confirmationCode).toBe('PARKA-123');
    });

    it('maps plannedArrival to slotStartTime', () => {
      const normalized = normalizeTripReservationEvidenceInput({
        tripItemId: 'item-1',
        poiId: 'is.landmannalaugar',
        plannedArrival: '09:00',
        confirmationCode: 'X',
      });
      expect(normalized.slotStartTime).toBe('09:00');
    });

    it('trims dateISO to YYYY-MM-DD', () => {
      const normalized = normalizeTripReservationEvidenceInput({
        tripItemId: 'item-1',
        poiId: 'is.landmannalaugar',
        dateISO: '2026-06-22T00:00:00.000Z',
        confirmationCode: 'X',
      });
      expect(normalized.dateISO).toBe('2026-06-22');
    });
  });

  describe('formatDateISO', () => {
    it('formats Date to ISO date', () => {
      expect(formatDateISO(new Date('2026-06-22T12:00:00.000Z'))).toBe('2026-06-22');
    });
  });
});
