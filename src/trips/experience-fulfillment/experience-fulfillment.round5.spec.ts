import type { DraftDay } from '../../dto/trip-draft.dto';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import { buildTravelUnderstandingCard } from './services/experience-intent.compiler';
import { buildExperienceExplanationFromUnderstanding } from './utils/experience-explanation.util';
import { buildItineraryPresentationBundle } from './utils/itinerary-presentation.util';
import { buildWhyRecommendPlannerBlocks } from './utils/why-recommend-blocks.util';

describe('experience-fulfillment Round 5', () => {
  const candidates: CandidatePlace[] = [
    {
      id: 1,
      nameCN: '黄金圈',
      type: 'ATTRACTION',
      category: 'ATTRACTION',
      lat: 64.1,
      lng: -21.9,
      tags: ['瀑布', '地热'],
      avgVisitDuration: 120,
      intensityFactor: 1.1,
      poiPlanningAdmissionProtected: true,
    },
    {
      id: 2,
      nameCN: '黑沙滩',
      type: 'ATTRACTION',
      category: 'ATTRACTION',
      lat: 63.4,
      lng: -19.0,
      tags: ['沙滩', '海岸'],
      avgVisitDuration: 90,
      intensityFactor: 0.9,
    },
  ];

  const draftDays: DraftDay[] = [
    {
      day: 1,
      date: '2026-07-01',
      slots: {
        morning: {
          placeId: 1,
          slot: 'morning' as const,
          startTime: '2026-07-01T09:00:00+00:00',
          endTime: '2026-07-01T12:00:00+00:00',
          reason: '经典环线起点',
          alternatives: [2],
          evidence: {
            draftConfidence: 'high',
            distance: 45000,
            riskTags: ['weather_sensitive'],
            openingHours: '09:00-18:00',
          },
        },
        afternoon: {
          placeId: 2,
          slot: 'afternoon' as const,
          startTime: '2026-07-01T14:00:00+00:00',
          endTime: '2026-07-01T17:00:00+00:00',
          reason: '海岸风光',
          evidence: {
            draftConfidence: 'medium',
            distance: 80000,
            riskTags: ['long_drive', 'weather_sensitive'],
          },
        },
      },
    },
  ];

  describe('itinerary presentation (PRD §13.3)', () => {
    it('builds day header and per-item inspiration + credible layers', () => {
      const understanding = buildTravelUnderstandingCard({
        message: '冰岛南岸 世界尽头感 不要太赶',
        tripContext: { tripDays: 5, vehicle: { accessClass: '2WD' } },
      });
      const explanation = buildExperienceExplanationFromUnderstanding(understanding);

      const bundle = buildItineraryPresentationBundle({
        draftDays,
        candidates,
        understanding,
        explanation,
        transport: 'car',
        hasElderly: true,
      });

      expect(bundle.revision).toBe('v1');
      expect(bundle.days.length).toBe(1);
      const day = bundle.days[0];
      expect(day.theme).toContain('黄金圈');
      expect(day.coreExperience).toBeTruthy();
      expect(day.certaintyLabel).toBeTruthy();
      expect(day.items.length).toBe(2);

      const morning = day.items[0];
      expect(morning.inspiration.placeName).toBe('黄金圈');
      expect(morning.inspiration.poeticLine.length).toBeGreaterThan(0);
      expect(morning.credible.driveHint || morning.credible.weatherHint).toBeTruthy();
      expect(morning.badges).toContain('HAS_ALTERNATIVE');
      expect(morning.badges).toContain('WEATHER_SENSITIVE');

      expect(JSON.stringify(bundle)).not.toMatch(/Decision OS/i);
      expect(JSON.stringify(bundle)).not.toMatch(/VERIFY/i);
    });
  });

  describe('why recommended blocks (confirm page)', () => {
    it('builds planner blocks from experience explanation', () => {
      const understanding = buildTravelUnderstandingCard({
        message: '7月冰岛冰川徒步，世界尽头感',
        tripContext: { tripDays: 8 },
      });
      const explanation = buildExperienceExplanationFromUnderstanding(understanding);
      const blocks = buildWhyRecommendPlannerBlocks(explanation);

      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe('why_recommended');
      expect(blocks[0].title).toContain('为什么推荐');
      expect(blocks[0].bullets.length).toBeGreaterThan(0);
      expect(blocks[0].dimensions.routeFeasibility).toContain('—');
      expect(blocks[0].dimensions.experienceMatch).toContain('—');
    });
  });
});
