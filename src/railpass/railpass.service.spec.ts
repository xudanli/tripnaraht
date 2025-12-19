// src/railpass/railpass.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RailPassService } from './railpass.service';
import { EligibilityEngineService } from './services/eligibility-engine.service';
import { PassSelectionEngineService } from './services/pass-selection-engine.service';
import { ReservationDecisionEngineService } from './services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from './services/reservation-orchestration.service';
import { TravelDayCalculationEngineService } from './services/travel-day-calculation-engine.service';
import { ComplianceValidatorService } from './services/compliance-validator.service';
import { ExecutabilityCheckService } from './services/executability-check.service';
import { PlanRegenerationService } from './services/plan-regeneration.service';
import { RailPassConstraintsService } from './constraints/railpass-constraints.service';
import { RailPassRuleEngineService } from './rules/railpass-rule-engine.service';
import { PassCoverageCheckerService } from './services/pass-coverage-checker.service';
import { ReservationChannelPolicyService } from './services/reservation-channel-policy.service';

describe('RailPassService', () => {
  let service: RailPassService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailPassService,
        EligibilityEngineService,
        PassSelectionEngineService,
        ReservationDecisionEngineService,
        ReservationOrchestrationService,
        TravelDayCalculationEngineService,
        ComplianceValidatorService,
        RailPassConstraintsService,
        RailPassRuleEngineService,
        PassCoverageCheckerService,
        ReservationChannelPolicyService,
        ExecutabilityCheckService,
        PlanRegenerationService,
      ],
    }).compile();

    service = module.get<RailPassService>(RailPassService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkEligibility', () => {
    it('should check eligibility for non-European resident', async () => {
      const result = await service.checkEligibility({
        residencyCountry: 'CN',
        travelCountries: ['FR', 'DE', 'IT'],
        departureDate: '2026-07-01',
      });

      expect(result).toBeDefined();
      expect(result.eligible).toBe(true);
      expect(result.recommendedPassFamily).toBe('EURAIL');
    });

    it('should check eligibility for European resident', async () => {
      const result = await service.checkEligibility({
        residencyCountry: 'FR',
        travelCountries: ['DE', 'IT'],
        departureDate: '2026-07-01',
      });

      expect(result).toBeDefined();
      expect(result.eligible).toBe(true);
      expect(result.recommendedPassFamily).toBe('INTERRAIL');
    });
  });

  describe('checkReservation', () => {
    it('should check reservation requirement for night train', async () => {
      const segment = {
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

      const result = await service.checkReservation(segment);

      expect(result).toBeDefined();
      expect(result.required).toBe(true);
      expect(result.mandatoryReasonCode).toBe('NIGHT_TRAIN');
    });
  });

  describe('simulateTravelDays', () => {
    it('should simulate travel days for Flexi Pass', async () => {
      const passProfile = {
        residencyCountry: 'CN',
        passFamily: 'EURAIL' as const,
        passType: 'GLOBAL' as const,
        validityType: 'FLEXI' as const,
        travelDaysTotal: 7,
        homeCountryOutboundUsed: 0,
        homeCountryInboundUsed: 0,
        class: 'SECOND' as const,
        mobileOrPaper: 'MOBILE' as const,
        validityStartDate: '2026-07-01',
        validityEndDate: '2026-07-31',
      };

      const segments = [
        {
          segmentId: 'seg-1',
          fromPlaceId: 1,
          toPlaceId: 2,
          fromCountryCode: 'FR',
          toCountryCode: 'DE',
          departureDate: '2026-07-02',
          isNightTrain: false,
          isHighSpeed: false,
          isInternational: true,
        },
      ];

      const result = await service.simulateTravelDays({
        segments,
        passProfile,
      });

      expect(result).toBeDefined();
      expect(result.totalDaysUsed).toBeGreaterThanOrEqual(0);
    });
  });
});
