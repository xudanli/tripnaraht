import { buildItineraryAdjustCorridorPoiSearchPlan } from './itinerary-adjust-corridor-poi-search.util';

describe('itinerary-adjust-corridor-poi-search.util', () => {
  it('走廊补检走 agent_internal 规则管道并产出多路', () => {
    const plan = buildItineraryAdjustCorridorPoiSearchPlan({
      destinationRaw: 'Iceland',
      anchors: {
        startAnchor: { lat: 63.4, lng: -19.0, label: 'vik' },
        endAnchor: { lat: 64.1, lng: -21.9, label: 'reykjavik' },
      },
    });
    expect(plan.contextualizedQuery).toMatch(/Iceland|attraction|landmark/i);
    expect(plan.routes.length).toBeGreaterThan(1);
    expect(plan.rewrite.pipeline?.stage1_source ?? 'rules').toBe('rules');
  });
});
