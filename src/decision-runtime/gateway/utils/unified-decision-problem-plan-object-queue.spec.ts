import type { DecisionProblemDetail } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  mapLegacyDetailToRow,
  projectRowToListItem,
} from './unified-decision-problem-projection.util';

describe('plan-object queue list projection', () => {
  it('CAS-123: lunch window problem always exposes day + POI scope for left rail', () => {
    const linkedIssue = {
      id: 'issue-meal-rainbow',
      priority: 'suggest_adjust' as const,
      category: 'schedule',
      title: '午餐窗冲突',
      message: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
      affectedDays: [],
      severity: 'medium' as const,
      issueKind: 'MEAL_WINDOW_VS_ARRIVAL',
      semanticKey: 'plan_object_meal_late_arrival_po_rainbow_meal_window_policy',
      anchors: { toDayNumber: 1 },
      proofs: [{ ruleId: 'MEAL_WINDOW_VS_ARRIVAL', entity: '日内评估', constraint: 'x', currentFact: 'x', evidenceSource: 'plan-object-evaluator', evidenceType: 'gateway_projection', conclusion: 'WARNING' }],
    };

    const detail: DecisionProblemDetail = {
      id: 'dp-meal-day1',
      tripId: 'trip-1',
      type: 'INFEASIBILITY',
      title: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
      description: linkedIssue.message,
      detectedBy: 'FEASIBILITY',
      detectedAt: new Date().toISOString(),
      tripVersion: '1',
      affectedScope: [],
      status: 'OPEN',
      semanticKey: linkedIssue.semanticKey,
      sourceRefs: [{ system: 'FEASIBILITY', refId: linkedIssue.id }],
      assertionIds: ['assert-1'],
      assertions: [
        {
          id: 'assert-1',
          sourceSystem: 'FEASIBILITY',
          sourceRefId: linkedIssue.id,
          nature: 'SOFT_CONSTRAINT',
          domain: 'TIME',
          enforcement: 'REQUIRE_ADJUSTMENT',
          overridable: true,
          condition: linkedIssue.message,
          conclusion: linkedIssue.message,
          proofs: [],
        },
      ],
    };

    const row = mapLegacyDetailToRow(detail, 'trip-1', undefined, linkedIssue);
    const item = projectRowToListItem(row, false);

    expect(item.title).toBe('午餐窗冲突');
    expect(item.legacySummary).toMatchObject({
      affectedDayNumbers: [1],
      affectedScopeSummary: '彩虹街',
      categoryLabel: '日程',
      description: linkedIssue.message,
    });
    expect(item.impactScopeView?.arrangements).toEqual([
      { label: '彩虹街', dayIndex: 1 },
    ]);
    expect(item.scope.dayIds).toEqual([1]);
  });
});
