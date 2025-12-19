// src/railpass/services/reservation-decision-engine.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';
import { RailSegment } from '../interfaces/railpass.interface';

describe('ReservationDecisionEngineService', () => {
  let service: ReservationDecisionEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReservationDecisionEngineService],
    }).compile();

    service = module.get<ReservationDecisionEngineService>(
      ReservationDecisionEngineService
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkReservation', () => {
    it('should require reservation for night train', () => {
      const segment: RailSegment = {
        segmentId: 'test-1',
        fromPlaceId: 1,
        toPlaceId: 2,
        fromCountryCode: 'FR',
        toCountryCode: 'DE',
        departureDate: '2026-07-01',
        isNightTrain: true,
        isHighSpeed: false,
        isInternational: true,
      };

      const result = service.checkReservation(segment);

      expect(result.required).toBe(true);
      expect(result.mandatoryReasonCode).toBe('NIGHT_TRAIN');
      expect(result.quotaRisk).toBeDefined();
      expect(result.feeEstimate).toBeDefined();
      expect(result.feeEstimate?.currency).toBe('EUR');
    });

    it('should require reservation for high-speed train', () => {
      const segment: RailSegment = {
        segmentId: 'test-2',
        fromPlaceId: 1,
        toPlaceId: 2,
        fromCountryCode: 'FR',
        toCountryCode: 'DE',
        departureDate: '2026-07-01',
        isNightTrain: false,
        isHighSpeed: true,
        isInternational: true,
      };

      const result = service.checkReservation(segment);

      expect(result.required).toBe(true);
      expect(result.mandatoryReasonCode).toBe('HIGH_SPEED');
    });

    it('should require reservation for international train', () => {
      const segment: RailSegment = {
        segmentId: 'test-3',
        fromPlaceId: 1,
        toPlaceId: 2,
        fromCountryCode: 'FR',
        toCountryCode: 'DE',
        departureDate: '2026-07-01',
        isNightTrain: false,
        isHighSpeed: false,
        isInternational: true,
      };

      const result = service.checkReservation(segment);

      expect(result.required).toBe(true);
      expect(result.mandatoryReasonCode).toBe('INTERNATIONAL');
    });

    it('should not require reservation for regular domestic train', () => {
      const segment: RailSegment = {
        segmentId: 'test-4',
        fromPlaceId: 1,
        toPlaceId: 2,
        fromCountryCode: 'FR',
        toCountryCode: 'FR',
        departureDate: '2026-07-01',
        isNightTrain: false,
        isHighSpeed: false,
        isInternational: false,
      };

      const result = service.checkReservation(segment);

      expect(result.required).toBe(false);
    });

    it('should assess high quota risk for peak season', () => {
      const segment: RailSegment = {
        segmentId: 'test-5',
        fromPlaceId: 1,
        toPlaceId: 2,
        fromCountryCode: 'FR',
        toCountryCode: 'IT',
        departureDate: '2026-07-15', // July (peak season)
        isNightTrain: true,
        isHighSpeed: true,
        isInternational: true,
      };

      const result = service.checkReservation(segment);

      // Should have higher risk during peak season
      expect(result.quotaRisk).toBe('HIGH');
    });

    it('should generate fallback options', () => {
      const segment: RailSegment = {
        segmentId: 'test-6',
        fromPlaceId: 1,
        toPlaceId: 2,
        fromCountryCode: 'FR',
        toCountryCode: 'DE',
        departureDate: '2026-07-01',
        isNightTrain: false,
        isHighSpeed: true,
        isInternational: true,
      };

      const options = service.generateFallbackOptions(segment);

      expect(options.length).toBeGreaterThan(0);
      expect(options.some(opt => opt.type === 'SWITCH_TO_SLOW_TRAIN')).toBe(true);
      expect(options.some(opt => opt.type === 'SHIFT_TIME')).toBe(true);
      expect(options.some(opt => opt.type === 'REPLACE_WITH_FLIGHT')).toBe(true);
      expect(options.some(opt => opt.type === 'REPLACE_WITH_BUS')).toBe(true);
    });
  });
});
