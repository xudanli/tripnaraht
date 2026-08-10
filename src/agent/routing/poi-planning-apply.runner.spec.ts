import {
  applyPoiPlanningToResearchPois,
  buildPoiPlanningAnchorFallbackStub,
} from './poi-planning-apply.runner';

describe('poi-planning-apply.runner', () => {
  it('applyPoiPlanningToResearchPois no-ops when not Iceland', () => {
    const pois = [{ name: 'Foo' }];
    const out = applyPoiPlanningToResearchPois(pois, undefined, 'JP');
    expect(out).toEqual({ pois, excludedFilteredCount: 0 });
  });

  it('buildPoiPlanningAnchorFallbackStub builds protected stub', () => {
    const stub = buildPoiPlanningAnchorFallbackStub('thingvellir');
    expect(stub.poi_planning_anchor_slug).toBe('thingvellir');
    expect(stub.poi_planning_admission_protected).toBe(true);
    expect(stub.source).toBe('poi_planning_fallback');
  });
});
