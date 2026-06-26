import {
  mapPhysicalEvaluationToResult,
  mapVerificationReportToResult,
} from './bridges/verification-result.bridge';
import { buildRepairContractFromVerification } from './bridges/repair-contract.builder';
import { compileExperienceIntent } from './services/experience-intent.compiler';
import { buildExperienceUnderstandingFromNl } from './services/experience-understanding.util';
import { validateRepairContract } from './validators/contract.validators';
import type { PhysicalEvaluationResult } from '../../domain/ontology/validator/physical-validator.types';
import type { VerificationReport } from '../../decision/kernel/decision-state.types';

describe('experience-fulfillment bridges (Round 2)', () => {
  describe('mapPhysicalEvaluationToResult — GS-01 F-road + 2WD', () => {
    const physical: PhysicalEvaluationResult = {
      validator_version: 'physical@1',
      rule_bundle_id: 'iceland-f-road',
      evaluated_at: '2026-07-01T12:00:00Z',
      blocking: true,
      violations: [
        {
          code: 'TERRAIN_F_ROAD_UNFIT',
          severity: 'BLOCK',
          detail: 'F-road segment requires 4WD; user vehicle is 2WD',
          evidence_source: 'policy:iceland-f-road',
        },
      ],
    };

    it('maps to REPAIR_REQUIRED with separated metrics', () => {
      const result = mapPhysicalEvaluationToResult(physical, {
        scope: 'CANDIDATE',
        experienceFulfillmentEstimate: 0.82,
      });
      expect(result.status).toBe('REPAIR_REQUIRED');
      expect(result.hardViolations.length).toBe(1);
      expect(result.metrics.feasibilityScore).toBeDefined();
      expect(result.metrics.evidenceConfidence).toBeDefined();
      expect(result.metrics.experienceFulfillmentEstimate).toBe(0.82);
      expect(result.repairInstructions.some((r) => r.action === 'REPLACE_ITEM')).toBe(true);
      expect(result.evidenceRefs).toContain('policy:iceland-f-road');
    });

    it('builds repair contract preserving world-edge intent', () => {
      const intent = compileExperienceIntent({
        message: '2WD 去高地日落，世界尽头感摄影',
      });
      const verification = mapPhysicalEvaluationToResult(physical, { scope: 'CANDIDATE' });
      const contract = buildRepairContractFromVerification(verification, intent, {
        tripContext: { revision: 'v1', destinationRegion: 'IS', vehicle: { accessClass: '2WD' } },
        targetIds: ['cand-highland-sunset'],
      });
      expect(contract).not.toBeNull();
      expect(contract!.preserveGoals.some((g) => g.priority === 'MUST_PRESERVE')).toBe(true);
      expect(contract!.replacementSearchSpace.vehicleAccess).toEqual(['2WD']);
      expect(contract!.terminationConditions.maxRepairRounds).toBe(2);
      const validation = validateRepairContract(contract);
      expect(validation.valid).toBe(true);
    });
  });

  describe('mapVerificationReportToResult — GS-07 UNKNOWN', () => {
    const report: VerificationReport = {
      issues: [
        {
          code: 'UNKNOWN',
          class: 'ADVISORY',
          message: 'Weather data missing for coast segment',
          source: 'OTHER',
          at: '2026-07-01T12:00:00Z',
        },
      ],
      hasFatal: false,
      hasConflict: false,
      hasAdvisory: true,
      counts: { fatal: 0, conflict: 0, advisory: 1 },
      verifiedAt: '2026-07-01T12:00:00Z',
    };

    it('returns UNKNOWN when dominant issue is UNKNOWN', () => {
      const result = mapVerificationReportToResult(report, { scope: 'DAY' });
      expect(result.status).toBe('UNKNOWN');
      expect(result.unknowns.length).toBe(1);
    });
  });

  describe('buildExperienceUnderstandingFromNl', () => {
    it('merges partialParams elderly + dates into understanding card', () => {
      const card = buildExperienceUnderstandingFromNl({
        text: '7月冰岛8天，冰川徒步，世界尽头感',
        partialParams: {
          hasElderly: true,
          startDate: '2026-07-01',
          endDate: '2026-07-08',
          totalBudget: 50000,
          currency: 'CNY',
          vehicleType: '2WD',
        },
      });
      expect(card.coreConstraints.some((c) => c.includes('8天'))).toBe(true);
      expect(card.memberConditions.length).toBeGreaterThan(0);
      expect(card.experienceIntent.experienceIntents.map((i) => i.atom)).toContain('GLACIER_ADVENTURE');
    });
  });
});
