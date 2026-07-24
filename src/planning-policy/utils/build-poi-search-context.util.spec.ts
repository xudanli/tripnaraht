import { buildPoiSearchContext, extractSelectedPlaceIdsFromItinerary } from './build-poi-search-context.util';

describe('build-poi-search-context.util', () => {
  it('extractSelectedPlaceIdsFromItinerary collects POI place_id from days', () => {
    const ids = extractSelectedPlaceIdsFromItinerary({
      days: [
        {
          items: [
            { type: 'POI', location_ref: { place_id: 'ChIJabc' } },
            { type: 'MEAL', location_ref: { place_id: 'meal1' } },
          ],
        },
      ],
    });
    expect(ids).toEqual(['chijabc']);
  });

  it('buildPoiSearchContext merges exclude + pacing + selected from draft', () => {
    const ctx = buildPoiSearchContext({
      destination: 'Tokyo',
      decisionState: {
        userIntent: {
          pace: 'relaxed',
          excludePoiIds: ['BAD1'],
          styleTags: ['photography'],
        },
        tripState: {
          planDraft: {
            days: [{ items: [{ type: 'POI', location_ref: { place_id: 'Sel1' } }] }],
          },
        },
      } as any,
    });
    expect(ctx.destination).toBe('Tokyo');
    expect(ctx.rejectedPoiIds).toEqual(['bad1']);
    expect(ctx.pacing).toBe('relaxed');
    expect(ctx.tripStyle).toEqual(['photography']);
    expect(ctx.selectedPoiIds).toEqual(['sel1']);
  });

  it('buildPoiSearchContext 从小众话术与 travelPreference 开启 preferOffbeat', () => {
    const ctx = buildPoiSearchContext({
      destination: 'Iceland',
      userMessage: '想要一些小众秘境，不要网红打卡',
      travelPreference: { preferOffbeatAttractions: true },
    });
    expect(ctx.preferOffbeatAttractions).toBe(true);
    expect(ctx.noveltyBias).toBeGreaterThanOrEqual(0.55);
  });
});
