import type { PoiCoverage } from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import {
  collectDecisionCheckerEvidenceItems,
  collectDestinationKnowledgeEvidenceItems,
  projectDayItineraryEvidenceItems,
} from './decision-checker-evidence.projection.util';

function poi(
  partial: Pick<PoiCoverage, 'id' | 'itemId' | 'day' | 'order' | 'name'> &
    Partial<Pick<PoiCoverage, 'evidenceTypes' | 'missingEvidence' | 'coverageStatus'>>,
): PoiCoverage {
  return {
    type: 'attraction',
    coordinates: { lat: 64, lng: -19 },
    coverageStatus: partial.coverageStatus ?? 'partial',
    evidenceCount: partial.evidenceTypes?.length ?? 0,
    ...partial,
  };
}

describe('decision-checker-evidence.projection.util', () => {
  const day3Pois: PoiCoverage[] = [
    poi({
      id: 'poi-1',
      itemId: 'item-skogafoss',
      day: 3,
      order: 1,
      name: '斯科加瀑布',
      evidenceTypes: ['opening_hours'],
      missingEvidence: ['weather'],
    }),
    poi({
      id: 'poi-2',
      itemId: 'item-seljalandsfoss',
      day: 3,
      order: 2,
      name: '塞里雅兰瀑布',
      missingEvidence: ['opening_hours', 'booking_confirmation'],
      coverageStatus: 'uncovered',
    }),
    poi({
      id: 'poi-3',
      itemId: 'item-vik-hotel',
      day: 3,
      order: 3,
      name: '维克酒店',
      evidenceTypes: ['booking_confirmation'],
    }),
    poi({
      id: 'poi-4',
      itemId: 'item-day4',
      day: 4,
      order: 1,
      name: '冰河湖',
      missingEvidence: ['opening_hours'],
    }),
  ];

  it('projects all POIs on focus day including those without open issues', () => {
    const items = projectDayItineraryEvidenceItems(day3Pois, 3, '2026-07-02T10:00:00Z');

    expect(items.some((i) => i.title === '塞里雅兰瀑布' && i.subtitle.includes('未获取'))).toBe(true);
    expect(items.some((i) => i.title === '斯科加瀑布')).toBe(true);
    expect(items.some((i) => i.title === '维克酒店')).toBe(true);
    expect(items.some((i) => i.title === '冰河湖')).toBe(false);
  });

  it('collectDecisionCheckerEvidenceItems prefers day itinerary when coverage is available', () => {
    const blueLagoonIssue: FeasibilityIssueDto = {
      id: 'issue-blue-lagoon',
      priority: 'must_handle',
      category: 'access',
      title: '蓝湖温泉需预约',
      message: '第1天 · 蓝湖温泉：需要预约',
      affectedDays: [1],
      severity: 'high',
      proofs: [
        {
          itemId: 'item-blue-lagoon',
          placeLabel: '蓝湖温泉',
          entity: '蓝湖温泉',
          constraint: 'booking_confirmation',
          currentFact: '预约确认证据未获取',
          evidenceSource: 'readiness.coverage',
          evidenceType: 'booking_confirmation',
          conclusion: '需预约',
          confidence: 0.85,
        },
      ],
    };

    const items = collectDecisionCheckerEvidenceItems({
      issue: blueLagoonIssue,
      coveragePois: [
        poi({
          id: 'poi-bl',
          itemId: 'item-blue-lagoon',
          day: 1,
          order: 1,
          name: '蓝湖温泉',
          missingEvidence: ['booking_confirmation'],
        }),
        ...day3Pois,
      ],
      focusDay: 3,
    });

    expect(items.filter((i) => i.title === '塞里雅兰瀑布').length).toBeGreaterThan(0);
    expect(items.some((i) => i.title === '蓝湖温泉')).toBe(false);
  });

  it('collectDestinationKnowledgeEvidenceItems maps POI access to destination_knowledge', () => {
    const items = collectDestinationKnowledgeEvidenceItems(
      [
        {
          id: 'poi-access:x:risk',
          source: 'feasibility',
          priority: 'suggest_adjust',
          category: 'access_capacity',
          title: '黑沙滩',
          message: '危险涌浪',
          issue: {
            id: 'poi-access:x:risk',
            priority: 'suggest_adjust',
            category: 'access_capacity',
            title: '黑沙滩',
            message: '危险涌浪',
            affectedDays: [2],
            severity: 'medium',
            proofs: [
              {
                entity: 'is.reynisfjara',
                constraint: 'SAFETY',
                currentFact: 'sneaker waves',
                evidenceSource: 'OFFICIAL',
                evidenceType: 'poi_access_capacity',
                conclusion: 'FEASIBLE_WITH_RISK',
              },
            ],
            visitorAccess: {
              evaluation: {
                verdict: 'FEASIBLE_WITH_RISK',
                poiId: 'is.reynisfjara',
                message: '勿靠近海岸线',
                confidence: 'OFFICIAL',
                planBHints: [{ action: 'SHIFT_ARRIVAL', detail: '避开涨潮' }],
              },
            },
          },
        },
      ],
      'poi-access:x:risk',
    );
    expect(items.some((i) => i.kind === 'destination_knowledge')).toBe(true);
    expect(items.some((i) => i.subtitle.includes('勿靠近'))).toBe(true);
  });
});
