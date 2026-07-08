import type { PlanningConflictItem } from '../../trip-constraint-solver/types/planning-conflicts.types';
import {
  conflictRefIdFromProblemId,
  dedupeInsights,
  filterConflictsForFocus,
  insightsFromPlanningConflict,
  insightsFromRagChunks,
} from './destination-insight.projection.util';

describe('destination-insight.projection.util', () => {
  const reynisfjaraConflict: PlanningConflictItem = {
    id: 'poi-access:item-1:poi_access_risk',
    source: 'feasibility',
    priority: 'suggest_adjust',
    category: 'access_capacity',
    title: '雷尼斯黑沙滩：准入提示',
    message: '危险涌浪；勿靠近海岸线',
    affectedDays: [2],
    semanticKey: 'id:poi-access:item-1:poi_access_risk',
    issue: {
      id: 'poi-access:item-1:poi_access_risk',
      priority: 'suggest_adjust',
      category: 'access_capacity',
      issueKind: 'poi_access_risk',
      title: '雷尼斯黑沙滩：准入提示',
      message: '危险涌浪',
      affectedDays: [2],
      severity: 'medium',
      proofs: [
        {
          entity: 'is.reynisfjara',
          constraint: 'SAFETY_RESTRICTION',
          currentFact: 'sneaker waves risk',
          evidenceSource: 'OFFICIAL',
          evidenceType: 'poi_access_capacity',
          conclusion: 'FEASIBLE_WITH_RISK',
        },
      ],
      visitorAccess: {
        evaluation: {
          verdict: 'FEASIBLE_WITH_RISK',
          poiId: 'is.reynisfjara',
          message: 'risk',
          confidence: 'OFFICIAL',
          planBHints: [{ action: 'SHIFT_ARRIVAL', detail: 'avoid high tide' }],
        },
      },
    },
  };

  it('maps conflict proofs and planB to insights', () => {
    const items = insightsFromPlanningConflict(reynisfjaraConflict);
    expect(items.some((i) => i.type === 'ACTIVITY_GUIDANCE')).toBe(true);
    expect(items.some((i) => i.type === 'ALTERNATIVE' && i.title === '改到达时刻')).toBe(true);
    expect(items.some((i) => i.sourceRefs[0]?.system === 'POI_ACCESS')).toBe(true);
  });

  it('conflictRefIdFromProblemId strips dp_id prefix', () => {
    expect(
      conflictRefIdFromProblemId('dp_id:poi-access:item-1:poi_access_risk'),
    ).toBe('poi-access:item-1:poi_access_risk');
  });

  it('filterConflictsForFocus by problemId', () => {
    const filtered = filterConflictsForFocus([reynisfjaraConflict], {
      problemId: 'dp_id:poi-access:item-1:poi_access_risk',
    });
    expect(filtered).toHaveLength(1);
  });

  it('insightsFromRagChunks marks GENERAL as explanatoryOnly', () => {
    const items = insightsFromRagChunks([
      { chunkId: 'c1', content: 'general tip', category: 'GENERAL' },
      { chunkId: 'c2', content: 'F208 closed', category: 'ROAD_STATUS', metadata: { roadId: 'F208' } },
    ]);
    expect(items.find((i) => i.id.includes('c1'))?.explanatoryOnly).toBe(true);
    expect(items.find((i) => i.id.includes('c2'))?.type).toBe('RULE');
    expect(items.find((i) => i.id.includes('c2'))?.applicability.roadIds).toEqual(['F208']);
  });

  it('dedupeInsights removes duplicate summaries', () => {
    const a = insightsFromPlanningConflict(reynisfjaraConflict);
    const b = dedupeInsights([...a, ...a]);
    expect(b.length).toBeLessThanOrEqual(a.length);
  });
});
