import type { ExtractedRoute } from '../types/guide-to-plan.types';
import { enrichCandidatesFromGuideRoutes } from './guide-plan-route.util';

describe('guide-plan-route.util', () => {
  it('assigns day and route order from extracted routes', () => {
    const candidates = [
      { rawName: '冰河湖', suggestedDay: null, routeOrder: null },
      { rawName: '黑沙滩', suggestedDay: null, routeOrder: null },
    ];
    const routes: ExtractedRoute[] = [
      { day: 2, description: '南岸', placeNames: ['冰河湖', '黑沙滩'] },
    ];

    const enriched = enrichCandidatesFromGuideRoutes(candidates, routes);
    expect(enriched[0].suggestedDay).toBe(2);
    expect(enriched[0].routeOrder).toBe(1);
    expect(enriched[1].suggestedDay).toBe(2);
    expect(enriched[1].routeOrder).toBe(2);
  });

  it('does not overwrite existing day assignment', () => {
    const candidates = [{ rawName: '雷克雅未克', suggestedDay: 1, routeOrder: 1 }];
    const routes: ExtractedRoute[] = [
      { day: 3, description: '市区', placeNames: ['雷克雅未克'] },
    ];

    const enriched = enrichCandidatesFromGuideRoutes(candidates, routes);
    expect(enriched[0].suggestedDay).toBe(1);
    expect(enriched[0].routeOrder).toBe(1);
  });
});
