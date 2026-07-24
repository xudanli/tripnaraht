import { ContextualRecommendationsService } from './contextual-recommendations.service';
import {
  icelandArrivalDayCanonical,
  icelandArrivalDayRecommendBody,
} from '../fixtures/iceland-arrival-day.fixture';

describe('ContextualRecommendationsService · Iceland arrival-day fixture', () => {
  function buildService() {
    const contextBuilder = {
      buildCanonical: jest.fn(async () => ({ ...icelandArrivalDayCanonical })),
    };
    const intentCompile = {
      compile: jest.fn(async (intent?: string) => ({
        contextDelta: intent?.includes('落地')
          ? {
              tripPhase: 'ARRIVAL_DAY' as const,
              desiredIntensity: 'LIGHT' as const,
              teamState: { energy: 'LOW' as const },
              preference: ['吃饭', '早点回酒店'],
              desiredReturnTime: '21:00',
            }
          : {},
        matchedPhrases: ['落地日', '体力偏低', '吃饭'],
        source: 'rules' as const,
      })),
    };
    const localCandidates = {
      loadNearHotel: jest.fn(async () => [
        {
          placeId: 101,
          name: 'Fish Market',
          kind: 'DINING' as const,
          distanceKm: 0.4,
        },
        {
          placeId: 202,
          name: '太阳航海者',
          kind: 'LIGHT_ACTIVITY' as const,
          productId: 'poi_sun_voyager',
          distanceKm: 0.9,
        },
      ]),
    };
    const travelEta = {
      estimate: jest.fn(async () => ({
        driveMinutes: 52,
        pickupBufferMinutes: 50,
        totalMinutesUntilHotel: 102,
        method: 'iceland_heuristic',
        fromLabel: 'Keflavik Airport',
      })),
    };
    const service = new ContextualRecommendationsService(
      contextBuilder as never,
      intentCompile as never,
      localCandidates as never,
      travelEta as never,
    );
    return { service, contextBuilder, intentCompile, localCandidates, travelEta };
  }

  it('returns a micro-plan (not POI cards) and never recommends Kirkjufell', async () => {
    const { service, contextBuilder, localCandidates, travelEta } = buildService();
    const view = await service.recommend(
      icelandArrivalDayCanonical.tripId,
      icelandArrivalDayRecommendBody,
    );

    expect(contextBuilder.buildCanonical).toHaveBeenCalled();
    expect(localCandidates.loadNearHotel).toHaveBeenCalled();
    expect(travelEta.estimate).toHaveBeenCalled();
    expect(view.scenario).toBe('SAME_DAY_ACTIVITY');
    expect(view.observation.summary).toMatch(/冰岛|体力|早出发|风雨/);
    expect(view.recommendation.schedule.length).toBeGreaterThanOrEqual(2);
    expect(view.recommendation.schedule.some((s) => s.type === 'HOTEL_CHECK_IN' || s.type === 'DINING')).toBe(
      true,
    );
    expect(view.alternatives.length).toBeLessThanOrEqual(2);
    expect(view.recommendation.gate).toMatch(/ALLOW|NEED_CONFIRM|REJECT/);
    expect(view.recommendation.feasibility).toBeDefined();
    expect(view.recommendation.reasonCodes).toContain('COMBINATION_SOLVER');
    expect(view.context.solverMethod).toBe('enumeration_v1');
    expect(view.alternatives.every((a) => a.schedule && a.schedule.length > 0)).toBe(true);
    expect(view.observation.facts?.some((f) => /到达酒店|驾驶|组合求解/.test(f))).toBe(true);

    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/教会山|Kirkjufell|蓝湖|Blue Lagoon/i);
    expect(blob).not.toMatch(/"groups"/); // attraction-explore shape
  });

  it('adverse weather converges away from outdoor LIGHT_ACTIVITY or marks repaired', async () => {
    const { service } = buildService();
    const view = await service.recommend(
      icelandArrivalDayCanonical.tripId,
      icelandArrivalDayRecommendBody,
    );
    const hasOutdoor = view.recommendation.schedule.some((s) => s.type === 'LIGHT_ACTIVITY');
    if (hasOutdoor) {
      expect(view.recommendation.gate).not.toBe('ALLOW');
    } else {
      expect(
        view.recommendation.reasonCodes.some((c) =>
          /WEATHER|FEASIBILITY_REPAIRED|FEASIBILITY_PASS|ARRIVAL_DAY/.test(c),
        ),
      ).toBe(true);
    }
  });
});
