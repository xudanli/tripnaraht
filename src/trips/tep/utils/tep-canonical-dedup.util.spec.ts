import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import {
  buildTepCanonicalDedupKey,
  dedupeAdjustmentQueueForTepCanonical,
  isCanonicalDuplicateOfTepPrimary,
  isTepPrimaryIntervention,
} from './tep-canonical-dedup.util';

const roadHook: DecisionHook = {
  hookId: 'HOOK-ROAD-D3-1',
  targetRef: 'drive_leg_3_1',
  triggerType: 'ROAD_STATUS_CHANGE',
  sourceMetric: 'road.status',
  triggerCondition: {
    metric: 'road.status',
    operator: 'IN',
    value: ['CLOSED', 'LIMITED', 'RESTRICTED'],
  },
  leadTime: 'PT24H',
  impactScope: ['drive_leg_3_1', 'activity_glacier_hike'],
  defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
  semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
};

const context = {
  tripId: 'cert_404',
  effectivePlanVersionId: 'plan_cert_404_v1',
  decisionHooks: [roadHook],
};

function intervention(partial: Partial<ExecutionInterventionDto>): ExecutionInterventionDto {
  return {
    schemaId: 'tripnara.execution_intervention@v1',
    id: partial.id ?? 'intervention-x',
    tripId: 'cert_404',
    type: partial.type ?? 'SAFETY_INTERVENTION',
    priority: partial.priority ?? 'CRITICAL',
    title: partial.title ?? '道路封闭',
    reason: partial.reason ?? 'F208 封闭',
    recommendedAction: '调整路线',
    affectedMembers: [],
    affectedActivities: partial.affectedActivities ?? [],
    alternativeActions: [],
    evidenceRefs: [],
    requiresConfirmation: true,
    autoExecutable: false,
    reversible: true,
    modifiesEffectivePlan: false,
    requiresRevalidation: false,
    status: 'OPEN',
    linkedRiskIds: partial.linkedRiskIds ?? [],
    actions: {
      primary: { label: '查看', action: 'view_impact', enabled: true },
      secondary: { label: '确认', action: 'complete', enabled: true },
      defer: { label: '稍后', action: 'defer', enabled: true },
    },
    ...partial,
  };
}

describe('tep-canonical-dedup.util', () => {
  it('builds stable dedup key', () => {
    expect(
      buildTepCanonicalDedupKey({
        tripId: 't1',
        eventSemanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
        targetRef: 'drive_leg_3_1',
        effectivePlanVersionId: 'plan_v1',
      }),
    ).toBe('t1|ROAD_SEGMENT_UNAVAILABLE|drive_leg_3_1|plan_v1');
  });

  it('suppresses canonical duplicate when TEP primary exists (IS-CERT-404)', () => {
    const items = [
      intervention({
        id: 'intervention-decision-problem_tep',
        decisionProblemId: 'problem_tep_HOOK-ROAD-D3-1_cert_404',
        title: 'TEP 道路封闭',
      }),
      intervention({
        id: 'intervention-decision-problem_canonical',
        decisionProblemId: 'problem_road_F208_cert_404',
        title: 'Canonical 道路封闭',
        affectedActivities: ['drive_leg_3_1'],
      }),
      intervention({
        id: 'intervention-risk-road',
        linkedRiskIds: ['risk_road_close'],
        affectedActivities: ['drive_leg_3_1'],
        title: '风险卡道路封闭',
      }),
    ];

    const deduped = dedupeAdjustmentQueueForTepCanonical(items, context);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.decisionProblemId).toBe('problem_tep_HOOK-ROAD-D3-1_cert_404');
    expect(isTepPrimaryIntervention(deduped[0]!)).toBe(true);
  });

  it('detects canonical problem duplicate of TEP primary', () => {
    const tep: Rfc001DecisionProblem = {
      problemId: 'problem_tep_HOOK-ROAD-D3-1_cert_404',
      tripId: 'cert_404',
      planVersionId: 'plan_cert_404_v1',
      type: 'RESOURCE_UNAVAILABLE',
      triggerEventId: 'evt_road_404',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      affectedEntityRefs: [{ kind: 'ROUTE_SEGMENT', id: 'drive_leg_3_1' }],
      affectedPlanItemIds: ['activity_glacier_hike'],
      worldStateSnapshotId: 'ws_404',
      detectedAt: '2026-08-09T10:00:00.000Z',
      urgency: 'HIGH',
      status: 'OPEN',
    };
    const canonical: Rfc001DecisionProblem = {
      problemId: 'problem_road_F208_cert_404',
      tripId: 'cert_404',
      planVersionId: 'plan_cert_404_v1',
      type: 'FEASIBILITY_FAILURE',
      triggerEventId: 'evt_road_404_legacy',
      affectedEntityRefs: [{ kind: 'ROUTE_SEGMENT', id: 'drive_leg_3_1' }],
      affectedPlanItemIds: ['activity_glacier_hike'],
      worldStateSnapshotId: 'ws_404',
      detectedAt: '2026-08-09T10:00:00.000Z',
      urgency: 'HIGH',
      status: 'OPEN',
    };

    expect(isCanonicalDuplicateOfTepPrimary(canonical, tep)).toBe(true);
  });
});
