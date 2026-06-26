import { GOLDEN_SCENARIOS } from './fixtures/golden-scenarios.fixture';
import { listMvpExperienceAtoms, MVP_EXPERIENCE_ATOM_REGISTRY } from './config/mvp-experience-atoms.config';
import {
  compileExperienceIntent,
  buildTravelUnderstandingCard,
} from './services/experience-intent.compiler';
import {
  validateExperienceCandidate,
  validateRepairContract,
  validateVerificationResult,
  verificationStatusAllowsStrongPass,
  verificationStatusIsUnknown,
  assertRepairPreserveGoals,
} from './validators/contract.validators';
import { MVP_EXPERIENCE_ATOM_CODES } from './types/experience-atom.types';
import type { ExperienceCandidate } from './types/candidate-contract.types';
import type { RepairContract } from './types/repair-contract.types';
import type { VerificationResult } from './types/verification-result.types';

describe('experience-fulfillment Round 1 protocol', () => {
  describe('MVP experience atoms', () => {
    it('registers exactly 8 MVP atoms per PRD §8.2', () => {
      expect(MVP_EXPERIENCE_ATOM_CODES).toHaveLength(8);
      expect(Object.keys(MVP_EXPERIENCE_ATOM_REGISTRY)).toHaveLength(8);
      for (const atom of listMvpExperienceAtoms()) {
        expect(atom.definition.length).toBeGreaterThan(0);
        expect(atom.userExpressions.length).toBeGreaterThan(0);
        expect(atom.positiveSignals.length).toBeGreaterThan(0);
        expect(atom.inspirationLanguage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('experience intent compiler', () => {
    it('extracts glacier MUST_PRESERVE and low-effort for parents scenario (PRD §6.1)', () => {
      const digest = compileExperienceIntent({
        message: '7月带父母去冰岛8天，我想拍一些有世界尽头感的照片，也想体验一次冰川徒步。父母不能走太久，希望整体不要太赶。',
        tripContext: { tripDays: 8 },
      });

      const atoms = digest.experienceIntents.map((i) => i.atom);
      expect(atoms).toContain('GLACIER_ADVENTURE');
      expect(atoms).toContain('REMOTE_WORLD_EDGE');
      expect(atoms).toContain('LOW_EFFORT_NATURE');
      expect(atoms).toContain('SLOW_TRAVEL_RELAXATION');

      const glacier = digest.experienceIntents.find((i) => i.atom === 'GLACIER_ADVENTURE');
      expect(glacier?.priority).toBe('MUST_PRESERVE');

      expect(digest.negativePreferences.some((p) => p.type === 'HIGH_PHYSICAL_EFFORT')).toBe(true);
    });

    it('builds travel understanding card for PRD §9.2', () => {
      const card = buildTravelUnderstandingCard({
        message: '7月带父母去冰岛8天，冰川徒步，世界尽头感，不要太赶',
        tripContext: { tripDays: 8, vehicle: { accessClass: '2WD' } },
      });

      expect(card.travelGoals.length).toBeGreaterThan(0);
      expect(card.memberConditions.length).toBeGreaterThan(0);
      expect(card.coreConstraints.some((c) => c.includes('8天'))).toBe(true);
      expect(card.systemAssumptions.some((a) => a.includes('2WD'))).toBe(true);
    });

    it('maps quick experience tags (PRD §9.1)', () => {
      const digest = compileExperienceIntent({
        quickTags: ['世界尽头', '少走路', '带父母'],
      });
      expect(digest.experienceIntents.map((i) => i.atom)).toEqual(
        expect.arrayContaining(['REMOTE_WORLD_EDGE', 'LOW_EFFORT_NATURE']),
      );
    });
  });

  describe('contract validators', () => {
    const sampleCandidate: ExperienceCandidate = {
      candidateId: 'cand-1',
      poiId: 'poi-reynisfjara',
      proposedExperienceAtoms: [
        { atom: 'REMOTE_WORLD_EDGE', expectedStrength: 0.85, priority: 'HIGH' },
      ],
      intendedParticipants: ['user', 'father', 'mother'],
      proposedTimeWindow: { start: '2026-07-10T08:00:00Z', end: '2026-07-10T10:00:00Z' },
      expectedDwellMinutes: 45,
      itineraryRole: 'RECOMMENDED',
      rationale: 'Black sand beach with world-edge horizon',
      evidenceRefs: ['ev-1'],
    };

    it('validates ExperienceCandidate schema', () => {
      const res = validateExperienceCandidate(sampleCandidate);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects candidate without atoms', () => {
      const bad = { ...sampleCandidate, proposedExperienceAtoms: [] };
      const res = validateExperienceCandidate(bad);
      expect(res.valid).toBe(false);
    });

    const sampleVerification: VerificationResult = {
      verificationRunId: 'vr-1',
      status: 'REPAIR_REQUIRED',
      scope: 'CANDIDATE',
      hardViolations: [
        {
          code: 'F_ROAD_2WD_INCOMPATIBLE',
          severity: 'HARD',
          message: 'F-road requires 4WD',
          evidenceRefs: ['ev-road-1'],
        },
      ],
      softRisks: [],
      unknowns: [],
      metrics: {
        feasibilityScore: 0.2,
        evidenceConfidence: 0.9,
        experienceFulfillmentEstimate: 0.85,
        scheduleRobustness: 0.7,
      },
      repairInstructions: [{ action: 'REPLACE_ITEM', targetId: 'cand-1' }],
      userDecisionsRequired: [],
      evidenceRefs: ['ev-road-1'],
    };

    it('validates VerificationResult with separated metrics', () => {
      const res = validateVerificationResult(sampleVerification);
      expect(res.valid).toBe(true);
    });

    const sampleRepair: RepairContract = {
      contractId: 'rc-1',
      scope: 'CANDIDATE',
      targetIds: ['cand-1'],
      trigger: {
        verificationRunId: 'vr-1',
        generatedAt: '2026-07-01T00:00:00Z',
        ruleVersion: 'physical-validator@1',
      },
      violations: sampleVerification.hardViolations,
      immutableConstraints: [
        { field: 'vehicle.accessClass', value: '2WD', reason: 'User confirmed 2WD rental' },
      ],
      preserveGoals: [
        { intent: 'REMOTE_WORLD_EDGE', minimumScore: 0.7, priority: 'MUST_PRESERVE' },
      ],
      relaxableConstraints: [
        { field: 'maxDetourMinutes', currentValue: 30, allowedRange: { min: 15, max: 60 } },
      ],
      replacementSearchSpace: {
        vehicleAccess: ['2WD'],
        maxDetourMinutes: 45,
        maxRadiusKm: 40,
      },
      optimizationObjective: {
        primary: 'preserve_experience_intent',
        secondary: ['minimize_detour'],
      },
      repairActionsAllowed: ['REPLACE_ITEM'],
      terminationConditions: { maxRepairRounds: 2, minimumAcceptableScore: 0.65 },
    };

    it('validates RepairContract with MUST_PRESERVE goals', () => {
      const res = validateRepairContract(sampleRepair);
      expect(res.valid).toBe(true);
    });

    it('rejects repair contract without MUST_PRESERVE', () => {
      const bad = {
        ...sampleRepair,
        preserveGoals: [{ intent: 'REMOTE_WORLD_EDGE', priority: 'HIGH' as const }],
      };
      const issues = assertRepairPreserveGoals(bad.preserveGoals);
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('golden scenarios fixture (PRD §17)', () => {
    it('defines 10 golden scenarios', () => {
      expect(GOLDEN_SCENARIOS).toHaveLength(10);
      const ids = GOLDEN_SCENARIOS.map((s) => s.id);
      expect(ids).toEqual([
        'GS-01',
        'GS-02',
        'GS-03',
        'GS-04',
        'GS-05',
        'GS-06',
        'GS-07',
        'GS-08',
        'GS-09',
        'GS-10',
      ]);
    });

    it('GS-07: UNKNOWN must not allow strong pass', () => {
      const gs = GOLDEN_SCENARIOS.find((s) => s.id === 'GS-07')!;
      expect(gs.expectedVerificationStatus).toBe('UNKNOWN');
      expect(verificationStatusAllowsStrongPass('UNKNOWN')).toBe(false);
      expect(verificationStatusIsUnknown('UNKNOWN')).toBe(true);
    });

    it('GS-04: compiler preserves glacier as MUST_PRESERVE for repair contract input', () => {
      const gs = GOLDEN_SCENARIOS.find((s) => s.id === 'GS-04')!;
      const digest = compileExperienceIntent({ message: gs.userInput });
      const glacier = digest.experienceIntents.find((i) => i.atom === 'GLACIER_ADVENTURE');
      expect(glacier?.priority).toBe('MUST_PRESERVE');
    });

    it('GS-06: low effort + world edge from quick tags', () => {
      const gs = GOLDEN_SCENARIOS.find((s) => s.id === 'GS-06')!;
      const digest = compileExperienceIntent({
        message: gs.userInput,
        quickTags: gs.quickTags,
      });
      const atoms = digest.experienceIntents.map((i) => i.atom);
      expect(atoms).toContain('REMOTE_WORLD_EDGE');
      expect(atoms).toContain('LOW_EFFORT_NATURE');
    });
  });
});
