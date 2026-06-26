import {
  buildExperienceExplanationFromVerification,
  buildExperienceExplanationFromUnderstanding,
} from './utils/experience-explanation.util';
import {
  buildExperienceFulfillmentReview,
  buildExperienceOutcomeRecord,
  appendOutcomeToMetadata,
  isTagAlignedWithPlannedAtoms,
  TRIP_EXPERIENCE_UNDERSTANDING_METADATA_KEY,
} from './utils/experience-outcome.util';
import type { VerificationResult } from './types/verification-result.types';
import { buildTravelUnderstandingCard } from './services/experience-intent.compiler';

describe('experience-fulfillment Round 4', () => {
  describe('experience explanation (PRD §13.5)', () => {
    const verification: VerificationResult = {
      verificationRunId: 'vr-1',
      status: 'PASS_WITH_WARNING',
      scope: 'TRIP',
      hardViolations: [],
      softRisks: [{ code: 'WEATHER', message: '海边风浪需出发前确认' }],
      unknowns: [],
      metrics: {
        feasibilityScore: 0.78,
        evidenceConfidence: 0.7,
        experienceFulfillmentEstimate: 0.85,
        scheduleRobustness: 0.72,
      },
      repairInstructions: [],
      userDecisionsRequired: [],
      evidenceRefs: ['ev-1'],
    };

    it('maps verification to four-level user certainty', () => {
      const card = buildExperienceExplanationFromVerification(verification);
      expect(card.overallLabelZh).toBeTruthy();
      expect(['条件极佳', '适合前往', '存在不确定性', '不建议前往']).toContain(card.overallLabelZh);
      expect(card.dimensions.routeFeasibility.labelZh).toBeTruthy();
      expect(card.dimensions.experienceMatch.labelZh).toBeTruthy();
      expect(card.dimensions.changingFactors.factors.length).toBeGreaterThan(0);
      expect(card.risks.some((r) => r.includes('风浪'))).toBe(true);
    });

    it('does not expose engineering terms in user文案', () => {
      const blocked: VerificationResult = {
        ...verification,
        status: 'BLOCKED',
        hardViolations: [
          {
            code: 'TERRAIN_F_ROAD_UNFIT',
            severity: 'HARD',
            message: 'Decision OS F-road 2WD BLOCK',
          },
        ],
      };
      const card = buildExperienceExplanationFromVerification(blocked);
      expect(card.overallLevel).toBe('NOT_RECOMMENDED');
      expect(JSON.stringify(card)).not.toMatch(/Decision OS/i);
    });

    it('builds explanation from travel understanding card', () => {
      const understanding = buildTravelUnderstandingCard({
        message: '7月冰岛冰川徒步，世界尽头感，不要太赶',
        tripContext: { tripDays: 8 },
      });
      const card = buildExperienceExplanationFromUnderstanding(understanding);
      expect(card.whyRecommended.length).toBeGreaterThan(0);
      expect(card.dimensions.experienceMatch.level).not.toBe('NOT_RECOMMENDED');
    });
  });

  describe('experience outcome graph (PRD §14)', () => {
    it('records alignment between tag and planned atoms', () => {
      const record = buildExperienceOutcomeRecord({
        tripId: 't1',
        memberId: 'u1',
        input: {
          triggerType: 'post_activity',
          activityName: '黑沙滩',
          experienceTagMatch: 'REMOTE_WORLD_EDGE',
          emotionalValueScore: 5,
        },
        plannedAtoms: ['REMOTE_WORLD_EDGE', 'GLACIER_ADVENTURE'],
      });
      expect(record.fulfillmentAligned).toBe(true);
      expect(record.matchedExpectedAtom).toBe('REMOTE_WORLD_EDGE');
    });

    it('aggregates fulfillment review from metadata outcomes', () => {
    const meta = appendOutcomeToMetadata(
      {
        [TRIP_EXPERIENCE_UNDERSTANDING_METADATA_KEY]: {
          revision: 'v1',
          travelGoals: ['世界尽头感'],
          memberConditions: [],
          coreConstraints: [],
          systemAssumptions: [],
          experienceIntent: {
            revision: 'v1',
            experienceIntents: [{ atom: 'REMOTE_WORLD_EDGE', weight: 0.9 }],
            negativePreferences: [],
          },
        },
      },
        buildExperienceOutcomeRecord({
          tripId: 't1',
          memberId: 'u1',
          input: { triggerType: 'daily_review', experienceTagMatch: 'REMOTE_WORLD_EDGE' },
          plannedAtoms: ['REMOTE_WORLD_EDGE'],
        }),
      );
      const review = buildExperienceFulfillmentReview(meta);
      expect(review?.alignmentRate).toBe(1);
      expect(review?.summaryZh).toContain('体验反馈');
    });

    it('detects misalignment for NOT_AS_EXPECTED', () => {
      expect(isTagAlignedWithPlannedAtoms('NOT_AS_EXPECTED', ['GLACIER_ADVENTURE'])).toBe(false);
    });
  });
});
