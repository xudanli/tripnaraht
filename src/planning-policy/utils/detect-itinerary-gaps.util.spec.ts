import {
  detectItineraryGapsV1,
  gapRetrievalIntentQuerySuffix,
  retrievalReasonFromSemanticGaps,
} from './detect-itinerary-gaps.util';
import type { DecisionState } from '../../decision/kernel/decision-state.types';

describe('detect-itinerary-gaps.util', () => {
  it('emits OVER_DENSE_DAY when fatigue high', () => {
    const gaps = detectItineraryGapsV1({
      poiSearchCtx: { destination: 'X', fatigueScore: 0.85 },
      itinerary: { days: [{ date: '2026-01-01', items: [{ type: 'POI' }] }] },
    });
    expect(gaps.map((g) => g.type)).toContain('OVER_DENSE_DAY');
    expect(retrievalReasonFromSemanticGaps(gaps)).toBe('reduce_day_density_pacing_recovery');
  });

  it('emits MISSING_RAIN_FALLBACK when adverse weather and no indoor-like POI', () => {
    const gaps = detectItineraryGapsV1({
      poiSearchCtx: {
        destination: 'Reykjavik',
        weather: { condition: 'elevated_precip_risk' },
      },
      itinerary: {
        days: [{ date: '2026-01-01', items: [{ type: 'POI', location_ref: { name: 'Outdoor waterfall' } }] }],
      },
    });
    expect(gaps.map((g) => g.type)).toContain('MISSING_RAIN_FALLBACK');
    expect(retrievalReasonFromSemanticGaps(gaps)).toBe('fill_missing_rain_indoor_experience');
  });

  it('POI_CLOSED + thermal hint → MISSING_RELAXED_EVENING with causedByEvent', () => {
    const caused = { type: 'POI_CLOSED' as const, poiId: 'lagoon1' };
    const gaps = detectItineraryGapsV1({
      poiSearchCtx: { destination: 'IS' },
      causedByEvent: caused,
      closedItemCategoryHint: 'HOT_SPRING',
    });
    const g = gaps.find((x) => x.type === 'MISSING_RELAXED_EVENING');
    expect(g).toBeDefined();
    expect(g?.causedByEvent).toEqual(caused);
    expect(retrievalReasonFromSemanticGaps(gaps)).toBe('fill_missing_relaxed_evening_experience');
  });

  it('gapRetrievalIntentQuerySuffix reflects primary gap', () => {
    const gaps = detectItineraryGapsV1({
      poiSearchCtx: { destination: 'IS', fatigueScore: 0.86 },
      itinerary: { days: [{ date: '2026-01-01', items: [] }] },
    });
    expect(gapRetrievalIntentQuerySuffix(gaps)).toMatch(/recovery|easy/i);
  });

  it('priority: rain gap beats relaxed evening', () => {
    const caused = { type: 'POI_CLOSED' as const, poiId: 'p1' };
    const dso = {
      environmentState: { weatherRisk: 0.9 },
    } as DecisionState;
    const gaps = detectItineraryGapsV1({
      poiSearchCtx: { destination: 'IS', pacing: 'relaxed' },
      decisionState: dso,
      itinerary: { days: [{ date: '2026-01-01', items: [] }] },
      causedByEvent: caused,
      closedItemCategoryHint: 'SPA',
    });
    expect(retrievalReasonFromSemanticGaps(gaps)).toBe('fill_missing_rain_indoor_experience');
  });
});
