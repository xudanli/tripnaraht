// src/trips/dto/trip-status.dto.spec.ts
/**
 * Backward compatibility tests for TripStatus
 *
 * Tests:
 * 1. Existing PLANNING trips still work
 * 2. Existing COMPLETED trips still work
 * 3. Existing CANCELLED trips still work
 * 4. Existing IN_PROGRESS trips are normalized to TRAVELING
 */

import { TripStatus, normalizeTripStatus } from './trip-status.dto';

describe('TripStatus - Backward Compatibility', () => {
  describe('Existing status values', () => {
    it('should recognize PLANNING as valid', () => {
      expect(TripStatus.PLANNING).toBe('PLANNING');
      expect(Object.values(TripStatus)).toContain('PLANNING');
    });

    it('should recognize COMPLETED as valid', () => {
      expect(TripStatus.COMPLETED).toBe('COMPLETED');
      expect(Object.values(TripStatus)).toContain('COMPLETED');
    });

    it('should recognize CANCELLED as valid', () => {
      expect(TripStatus.CANCELLED).toBe('CANCELLED');
      expect(Object.values(TripStatus)).toContain('CANCELLED');
    });

    it('should recognize IN_PROGRESS as valid (deprecated)', () => {
      expect(TripStatus.IN_PROGRESS).toBe('IN_PROGRESS');
      expect(Object.values(TripStatus)).toContain('IN_PROGRESS');
    });
  });

  describe('normalizeTripStatus - Backward compatibility', () => {
    it('should return PLANNING as-is', () => {
      expect(normalizeTripStatus('PLANNING')).toBe(TripStatus.PLANNING);
    });

    it('should return COMPLETED as-is', () => {
      expect(normalizeTripStatus('COMPLETED')).toBe(TripStatus.COMPLETED);
    });

    it('should return CANCELLED as-is', () => {
      expect(normalizeTripStatus('CANCELLED')).toBe(TripStatus.CANCELLED);
    });

    it('should map IN_PROGRESS to TRAVELING', () => {
      expect(normalizeTripStatus('IN_PROGRESS')).toBe(TripStatus.TRAVELING);
    });

    it('should handle null status as DRAFT', () => {
      expect(normalizeTripStatus(null)).toBe(TripStatus.DRAFT);
    });

    it('should handle undefined status as DRAFT', () => {
      expect(normalizeTripStatus(undefined as any)).toBe(TripStatus.DRAFT);
    });
  });

  describe('New lifecycle states', () => {
    it('should include DRAFT', () => {
      expect(TripStatus.DRAFT).toBe('DRAFT');
      expect(Object.values(TripStatus)).toContain('DRAFT');
    });

    it('should include RECRUITING', () => {
      expect(TripStatus.RECRUITING).toBe('RECRUITING');
      expect(Object.values(TripStatus)).toContain('RECRUITING');
    });

    it('should include FORMING', () => {
      expect(TripStatus.FORMING).toBe('FORMING');
      expect(Object.values(TripStatus)).toContain('FORMING');
    });

    it('should include TRAVELING', () => {
      expect(TripStatus.TRAVELING).toBe('TRAVELING');
      expect(Object.values(TripStatus)).toContain('TRAVELING');
    });
  });

  describe('Status comparison logic', () => {
    it('should allow comparison with string literals', () => {
      const status: TripStatus = TripStatus.PLANNING;
      expect(status === 'PLANNING').toBe(true);
    });

    it('should allow comparison with enum values', () => {
      const status: string = 'PLANNING';
      expect(status === TripStatus.PLANNING).toBe(true);
    });

    it('should handle IN_PROGRESS comparison for legacy code', () => {
      const status: string = 'IN_PROGRESS';
      const normalized = normalizeTripStatus(status);
      expect(normalized).toBe(TripStatus.TRAVELING);
    });
  });
});
