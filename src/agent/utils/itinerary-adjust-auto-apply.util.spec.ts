import {
  buildItineraryAdjustAutoApplyLeadMessage,
  classifyItineraryAdjustSubIntent,
  evaluateItineraryAdjustConfidenceGate,
  resolveItineraryAdjustExecutionMode,
} from './itinerary-adjust-auto-apply.util';

describe('itinerary-adjust-auto-apply', () => {
  it('classifies strong modification for replan day 2', () => {
    expect(
      classifyItineraryAdjustSubIntent('帮我把第二天重新规划一下，现在明显不合理'),
    ).toBe('strong_modification');
  });

  it('classifies exploratory for recommendation phrasing', () => {
    expect(
      classifyItineraryAdjustSubIntent('第二天如果不去瀑布还能去哪，有什么推荐？'),
    ).toBe('exploratory');
  });

  it('classifies poi_slot_fill for trip-scoped recommend-add', () => {
    expect(
      classifyItineraryAdjustSubIntent('根据我的行程，推荐一些适合加入的景点'),
    ).toBe('poi_slot_fill');
    expect(
      resolveItineraryAdjustExecutionMode({
        subIntent: 'poi_slot_fill',
        highConfidence: false,
        poiSlotFillReady: true,
      }),
    ).toBe('SEMI_AUTO');
  });

  it('allows AUTO only when strong intent and L0 corridor', () => {
    const sub = 'strong_modification' as const;
    const conf = evaluateItineraryAdjustConfidenceGate({
      itinerary_adjust_corridor_fallback_level: 'baseline_50km',
      itinerary_adjust_corridor_fallback: {
        tierAttempts: [
          {
            inputCount: 10,
            matched: 6,
            droppedOutlier: 3,
            droppedGoldenCircle: 1,
            noCoords: 0,
            bufferKm: 50,
          },
        ],
      },
    });
    expect(conf.highConfidence).toBe(true);
    expect(resolveItineraryAdjustExecutionMode({ subIntent: sub, highConfidence: true })).toBe(
      'AUTO',
    );
  });

  it('blocks high confidence when L4 poi_search used', () => {
    const conf = evaluateItineraryAdjustConfidenceGate({
      itinerary_adjust_corridor_fallback_level: 'expanded_120km',
      itinerary_adjust_corridor_fallback: { poiSearchSupplementCount: 5 },
      itinerary_adjust_corridor_poi_search: { count: 5 },
    });
    expect(conf.highConfidence).toBe(false);
    expect(
      resolveItineraryAdjustExecutionMode({
        subIntent: 'strong_modification',
        highConfidence: conf.highConfidence,
      }),
    ).toBe('ADVICE_ONLY');
  });

  it('builds user-facing lead for applied vs draft', () => {
    expect(
      buildItineraryAdjustAutoApplyLeadMessage({
        applied: true,
        executionMode: 'AUTO',
        dayNumber: 2,
      }),
    ).toContain('已为你重新规划并更新');
    expect(
      buildItineraryAdjustAutoApplyLeadMessage({
        applied: false,
        executionMode: 'ADVICE_ONLY',
        dayNumber: 2,
      }),
    ).toContain('优化草案');
  });
});
