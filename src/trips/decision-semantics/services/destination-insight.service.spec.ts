import { DestinationInsightService } from './destination-insight.service';
import type { PlanningConflictsResponse } from '../../trip-constraint-solver/types/planning-conflicts.types';

describe('DestinationInsightService', () => {
  const reynisfjaraConflict = {
    id: 'poi-access:item-1:poi_access_risk',
    source: 'feasibility' as const,
    priority: 'suggest_adjust' as const,
    category: 'access_capacity' as const,
    title: '雷尼斯黑沙滩',
    message: '危险涌浪',
    issue: {
      id: 'poi-access:item-1:poi_access_risk',
      priority: 'suggest_adjust' as const,
      category: 'access_capacity',
      title: '雷尼斯黑沙滩',
      message: '危险涌浪',
      affectedDays: [2],
      severity: 'medium' as const,
      visitorAccess: {
        evaluation: {
          verdict: 'FEASIBLE_WITH_RISK',
          poiId: 'is.reynisfjara',
          message: 'risk',
          confidence: 'OFFICIAL',
          planBHints: [],
        },
      },
    },
  };

  it('getBundle aggregates conflicts without RAG by default', async () => {
    const planningConflicts = {
      getPlanningConflicts: jest.fn().mockResolvedValue({
        conflicts: [reynisfjaraConflict],
      } as Partial<PlanningConflictsResponse>),
    };
    const problemCollector = { collect: jest.fn() };
    const svc = new DestinationInsightService(
      planningConflicts as any,
      problemCollector as any,
      undefined,
    );

    const bundle = await svc.getBundle('trip-1', {
      focusConflictId: 'poi-access:item-1:poi_access_risk',
    });

    expect(bundle.schemaId).toBe('tripnara.destination_insight_bundle@v1');
    expect(bundle.insights.length).toBeGreaterThan(0);
    expect(bundle.meta.ragRetrievalSkipped).toBe(true);
    expect(bundle.meta.skipReason).toBe('includeRag_not_requested');
  });
});
