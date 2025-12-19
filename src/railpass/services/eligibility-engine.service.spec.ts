// src/railpass/services/eligibility-engine.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { EligibilityEngineService } from './eligibility-engine.service';

describe('EligibilityEngineService', () => {
  let service: EligibilityEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EligibilityEngineService],
    }).compile();

    service = module.get<EligibilityEngineService>(EligibilityEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkEligibility', () => {
    it('should recommend Eurail for non-European residents', () => {
      const result = service.checkEligibility({
        residencyCountry: 'CN',
        travelCountries: ['FR', 'DE', 'IT'],
        departureDate: '2026-07-01',
      });

      expect(result.eligible).toBe(true);
      expect(result.recommendedPassFamily).toBe('EURAIL');
      expect(result.constraints).toContain('必须购买 Eurail Pass（非欧洲居住者）');
    });

    it('should recommend Interrail for European residents', () => {
      const result = service.checkEligibility({
        residencyCountry: 'FR',
        travelCountries: ['DE', 'IT'],
        departureDate: '2026-07-01',
      });

      expect(result.eligible).toBe(true);
      expect(result.recommendedPassFamily).toBe('INTERRAIL');
      expect(result.constraints).toContain('必须购买 Interrail Pass（欧洲居住者）');
    });

    it('should check Interrail home country rules when crossing residency country', () => {
      const result = service.checkEligibility({
        residencyCountry: 'FR',
        travelCountries: ['FR', 'DE', 'IT'],
        isCrossResidencyCountry: true,
        departureDate: '2026-07-01',
      });

      expect(result.eligible).toBe(true);
      expect(result.recommendedPassFamily).toBe('INTERRAIL');
      expect(result.homeCountryRules).toBeDefined();
      expect(result.homeCountryRules?.maxAllowed).toBe(1);
    });

    it('should validate home country usage', () => {
      // Valid usage
      const validResult = service.validateHomeCountryUsage({
        passFamily: 'INTERRAIL',
        residencyCountry: 'FR',
        outboundUsed: 1,
        inboundUsed: 1,
      });
      expect(validResult.valid).toBe(true);
      expect(validResult.violations).toHaveLength(0);

      // Invalid: outbound exceeded
      const invalidOutbound = service.validateHomeCountryUsage({
        passFamily: 'INTERRAIL',
        residencyCountry: 'FR',
        outboundUsed: 2,
        inboundUsed: 1,
      });
      expect(invalidOutbound.valid).toBe(false);
      expect(invalidOutbound.violations.length).toBeGreaterThan(0);

      // Invalid: inbound exceeded
      const invalidInbound = service.validateHomeCountryUsage({
        passFamily: 'INTERRAIL',
        residencyCountry: 'FR',
        outboundUsed: 1,
        inboundUsed: 2,
      });
      expect(invalidInbound.valid).toBe(false);
      expect(invalidInbound.violations.length).toBeGreaterThan(0);
    });
  });
});
