import type { ActiveRisk } from '../types/execution-risk.types';
import {
  backfillRiskLinksForPrimarySso,
  buildSuppressedRiskIdsForPrimarySso,
  filterRisksForPrimarySso,
} from './attention-primary-sso-projection.util';
import type { AttentionPrimarySsoCutoverPlan } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';
import { buildAttentionPrimarySsoCutoverPlan } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';

function baseRisk(overrides: Partial<ActiveRisk> & Pick<ActiveRisk, 'id'>): ActiveRisk {
  return {
    riskKey: `key:${overrides.id}`,
    tripId: 'c0c77777-7777-4777-8777-777777777777',
    type: 'ENVIRONMENT',
    code: 'WEATHER_SEVERE',
    title: 'weather',
    summary: 'wind',
    level: 'HIGH',
    executionGate: 'REPLAN_REQUIRED',
    lifecycleStatus: 'ACTIVE',
    acknowledgementStatus: 'UNSEEN',
    treatmentStatus: 'ACTION_REQUIRED',
    detectedAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    affectedMembers: [],
    affectedActivities: [],
    affectedLocations: [],
    affectedRouteSegments: [],
    sourceRefs: [{ sourceSystem: 'ATTENTION_QUEUE', sourceId: 'attn-1' }],
    evidenceRefs: [],
    recommendationIds: [],
    interventionIds: [],
    decisionProblemIds: [],
    ...overrides,
  };
}

describe('attention-primary-sso-projection.util', () => {
  const tripId = 'c0c77777-7777-4777-8777-777777777777';

  const plan: AttentionPrimarySsoCutoverPlan = buildAttentionPrimarySsoCutoverPlan(tripId, {
    shadowPrimaryItems: [
      {
        clusterId: 'cluster_wind',
        tripId,
        primaryProblemId: 'stg_attn_infeasible',
        primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
        headline: '强风导致今天的原计划无法按时完成',
        explanation: '预计到达下一活动时间已超过最晚入场时间',
        causalStory: [],
        attentionLevel: 'INTERRUPT',
        status: 'OPEN',
        relatedEffects: [
          {
            problemId: 'stg_attn_wind',
            semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
            label: '强风',
          },
        ],
        confirmationEntry: { problemId: 'stg_attn_infeasible', actionRoute: 'decision-queue' },
        firstObservedAt: '2026-07-12T10:00:00.000Z',
        lastUpdatedAt: '2026-07-12T10:00:00.000Z',
      },
    ],
    shadowClusters: [
      {
        clusterId: 'cluster_wind',
        tripId,
        rootCauseKey: 'weather:episode:1',
        rootCauseType: 'WEATHER_STRONG_WIND',
        primaryProblemId: 'stg_attn_infeasible',
        relatedProblemIds: ['stg_attn_wind', 'stg_attn_slip'],
        causalChain: [],
        attentionLevel: 'INTERRUPT',
        status: 'OPEN',
        firstObservedAt: '2026-07-12T10:00:00.000Z',
        lastUpdatedAt: '2026-07-12T10:00:00.000Z',
      },
    ],
    legacyVisible: [],
  });

  it('suppresses orphan weather risk via cluster root cause', () => {
    const primary = baseRisk({
      id: 'risk_primary',
      type: 'SCHEDULE',
      code: 'SCHEDULE_DELAY',
      title: '执行偏差',
      decisionProblemIds: ['stg_attn_infeasible'],
      sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'stg_attn_infeasible' }],
      executionGate: 'STOP',
    });
    const orphanWeather = baseRisk({ id: 'risk_weather_dup' });
    const unrelated = baseRisk({
      id: 'risk_volcano',
      code: 'WEATHER_SEVERE',
      title: 'Volcanic ash warning',
      summary: 'ash cloud',
      sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: 'env-volcano' }],
    });

    const risks = [primary, orphanWeather, unrelated];
    const suppressed = buildSuppressedRiskIdsForPrimarySso(risks, plan);
    expect(suppressed.has('risk_weather_dup')).toBe(true);
    expect(suppressed.has('risk_primary')).toBe(false);
    expect(suppressed.has('risk_volcano')).toBe(false);

    const filtered = filterRisksForPrimarySso(risks, plan);
    expect(filtered.map((r) => r.id)).toEqual(['risk_primary', 'risk_volcano']);
  });

  it('dedupes duplicate schedule conflict cards', () => {
    const primary = baseRisk({
      id: 'risk_primary',
      decisionProblemIds: ['stg_attn_infeasible'],
      sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'stg_attn_infeasible' }],
    });
    const stopConflict = baseRisk({
      id: 'risk_conflict_stop',
      type: 'SCHEDULE',
      code: 'SCHEDULE_DELAY',
      title: '时间冲突',
      executionGate: 'STOP',
      affectedActivities: [{ id: 'act-b', label: 'POI B', kind: 'activity' }],
      decisionProblemIds: ['dp_time'],
      sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'dp_time' }],
    });
    const replanConflict = baseRisk({
      id: 'risk_conflict_dup',
      type: 'SCHEDULE',
      code: 'SCHEDULE_DELAY',
      title: '时间冲突',
      executionGate: 'REPLAN_REQUIRED',
      affectedActivities: [{ id: 'act-b', label: 'POI B', kind: 'activity' }],
    });

    const suppressed = buildSuppressedRiskIdsForPrimarySso(
      [primary, stopConflict, replanConflict],
      plan,
    );
    expect(suppressed.has('risk_conflict_dup')).toBe(true);
    expect(suppressed.has('risk_conflict_stop')).toBe(false);
  });

  it('backfills decision links for weather risks in wind cluster', () => {
    const weather = baseRisk({ id: 'risk_weather' });
    const [linked] = backfillRiskLinksForPrimarySso([weather], plan);
    expect(linked.decisionProblemIds).toContain('stg_attn_wind');
  });
});
