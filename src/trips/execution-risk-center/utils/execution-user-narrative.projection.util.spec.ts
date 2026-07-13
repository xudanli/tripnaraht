import {
  enrichAlertWithUserNarrative,
  enrichInterventionWithUserNarrative,
  projectUserNarrativeFromAlert,
} from './execution-user-narrative.projection.util';
import { buildHarnessActiveRisks, HARNESS_ACTIVITY_ID } from '../harness/execution-risk-p0.harness.util';
import { projectActiveRiskToExecutionAlert } from '../../../mobile/utils/active-risk-alert.projection.util';
import { projectConsumerToIntervention } from './execution-intervention.projection.util';
import type { ConsumerDecisionItem } from '../../travel-status/types/travel-status.types';

describe('execution-user-narrative.projection.util', () => {
  it('projects weather alert narrative with route and hazard — not internal taxonomy', () => {
    const risk = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const alert = projectActiveRiskToExecutionAlert(risk);
    const enriched = enrichAlertWithUserNarrative(alert, {
      requiredAction: 'STOP',
      sourceRisk: risk,
    });

    expect(enriched.userNarrative?.whatHappened).toContain('不建议');
    expect(enriched.userNarrative?.whatHappened).not.toMatch(/道路\s*\/\s*可行性/);
    expect(enriched.userNarrative?.impactOnTrip.length).toBeGreaterThan(0);
    expect(enriched.userActions?.[0]?.role).toBe('primary');
    expect(enriched.userActions?.some((a) => a.label === '保持原计划')).toBe(false);
  });

  it('projects road closed narrative from alert', () => {
    const risk = buildHarnessActiveRisks().find((r) => r.decisionProblemIds.length > 0)!;
    const roadRisk = { ...risk, code: 'ROAD_CLOSED' as const, type: 'ROAD_TRANSPORT' as const };
    const alert = projectActiveRiskToExecutionAlert(roadRisk);
    const narrative = projectUserNarrativeFromAlert(alert, { sourceRisk: roadRisk });

    expect(narrative.whatHappened).toMatch(/封闭|无法通行/);
    expect(narrative.whatHappened).not.toContain('可行性');
  });

  it('humanizes internal decision titles for intervention narrative', () => {
    const consumer: ConsumerDecisionItem = {
      schemaId: 'tripnara.consumer_decision_item@v1',
      problemId: 'stg_attn_wind',
      headline: '道路 / 可行性：1 个行程项受影响',
      explanation: 'RFC-001 FEASIBILITY_FAILURE · urgency HIGH',
      impact: '部分行程项在当前条件下不可行',
      severity: 'BLOCK',
      actions: {
        acceptRecommended: { enabled: false },
        keepOriginal: { enabled: false },
        viewAlternatives: { enabled: true, count: 1 },
        defer: { enabled: false },
      },
    };

    const item = projectConsumerToIntervention({
      consumer,
      tripId: 'trip-1',
      memberNamesById: new Map(),
      activityTitleById: new Map([[HARNESS_ACTIVITY_ID, '蓝湖温泉']]),
      actionDeadline: '2026-07-12T18:00:00.000Z',
    });
    item.affectedActivities = ['蓝湖温泉'];

    const enriched = enrichInterventionWithUserNarrative(item);
    expect(enriched.userNarrative?.whatHappened).not.toMatch(/道路\s*\/\s*可行性/);
    expect(enriched.userNarrative?.impactOnTrip).toContain('蓝湖温泉');
    expect(enriched.userNarrative?.recommendation).toBeTruthy();
    expect(enriched.userActions?.[0]?.label).not.toMatch(/保持原计划/);
  });

  it('projects time conflict alert with activity names', () => {
    const base = buildHarnessActiveRisks()[0]!;
    const timeRisk = {
      ...base,
      type: 'SCHEDULE' as const,
      code: 'SCHEDULE_DELAY' as const,
      title: '时间冲突',
      summary: 'overlap 60 min',
      executionGate: 'STOP' as const,
      affectedActivities: [
        { id: 'a', label: 'Exec Slip POI A', kind: 'activity' as const },
        { id: 'b', label: 'Exec Slip POI B', kind: 'activity' as const },
      ],
    };
    const alert = projectActiveRiskToExecutionAlert(timeRisk);
    const narrative = projectUserNarrativeFromAlert(alert, { sourceRisk: timeRisk });
    expect(narrative.whatHappened).toContain('POI A');
    expect(narrative.whatHappened).toContain('POI B');
    expect(narrative.whatHappened).not.toBe('时间冲突');
  });

  it('localizes English volcano impact labels', () => {
    const risk = buildHarnessActiveRisks()[0]!;
    const alert = projectActiveRiskToExecutionAlert({
      ...risk,
      type: 'ROAD_TRANSPORT',
      code: 'ROAD_CLOSED',
      title: 'Roads near volcano closed by authorities',
      summary: 'Roads near volcano closed by authorities',
    });
    const enriched = enrichAlertWithUserNarrative(alert, { sourceRisk: risk });
    expect(enriched.userNarrative?.whatHappened).toMatch(/封闭|无法通行/);
    expect(enriched.userNarrative?.impactOnTrip).not.toMatch(/Roads near volcano/i);
  });
});
