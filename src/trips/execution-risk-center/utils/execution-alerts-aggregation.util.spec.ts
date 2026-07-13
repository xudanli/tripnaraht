import {
  aggregateExecutionAlertRisks,
  buildActionOrientedRecommendation,
  buildBannerDetail,
  extractRiskDayNumbers,
  isScheduleDerivedFromPrimary,
  resolvePrimaryRiskId,
} from './execution-alerts-aggregation.util';
import {
  buildHarnessActiveRisks,
  harnessWindEnvironmentDetail,
  HARNESS_ACTIVITY_ID,
  HARNESS_TRIP_ID,
  stableWindRiskId,
} from '../harness/execution-risk-p0.harness.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import { buildRiskKey } from './risk-key.util';
import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';

function buildScheduleRisk(overrides: Partial<ActiveRisk> & Pick<ActiveRisk, 'id' | 'riskKey'>): ActiveRisk {
  const base = buildHarnessActiveRisks()[0]!;
  return {
    ...base,
    type: 'SCHEDULE',
    code: 'SCHEDULE_DELAY',
    executionGate: 'REPLAN_REQUIRED',
    level: 'HIGH',
    sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'dp-traffic' }],
    decisionProblemIds: ['dp-traffic'],
    ...overrides,
  };
}

describe('execution-alerts-aggregation.util', () => {
  it('selects environment weather as primary over road and attention duplicates', () => {
    const risks = buildHarnessActiveRisks();
    const result = aggregateExecutionAlertRisks(risks);

    expect(result.primary?.risk.id).toBe(stableWindRiskId());
    expect(result.primary?.role).toBe('PRIMARY');
    expect(result.listAlerts.some((a) => a.risk.code === 'WEATHER_STRONG_WIND')).toBe(true);
    expect(result.listAlerts.some((r) => r.risk.sourceRefs.some((s) => s.sourceSystem === 'ATTENTION_QUEUE'))).toBe(
      false,
    );
  });

  it('folds same-day schedule tightness into impacts when primary is AT_RISK', () => {
    const primary = {
      ...buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!,
      executionGate: 'AT_RISK' as const,
      level: 'MEDIUM' as const,
    };
    const scheduleRisk = buildScheduleRisk({
      id: 'risk_schedule_day1',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day1',
        affectedScope: 'day-1',
      }),
      title: '同日交通偏紧',
      summary: '预计延误约 47 分钟，首项开始时间偏紧',
      affectedActivities: [
        { id: HARNESS_ACTIVITY_ID, label: '瓦特纳冰川徒步', kind: 'activity' },
      ],
    });

    expect(isScheduleDerivedFromPrimary(scheduleRisk, primary)).toBe(true);

    const result = aggregateExecutionAlertRisks([primary, scheduleRisk]);
    expect(result.listAlerts.some((a) => a.risk.title === '同日交通偏紧')).toBe(false);
    expect(result.impacts.some((i) => i.type === 'DELAY' && i.label.includes('47'))).toBe(true);
    expect(result.impacts.some((i) => i.type === 'ITINERARY' && i.label.includes('第 1 天'))).toBe(true);
  });

  it('does not fold same-day schedule into impacts when primary is STOP', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const scheduleRisk = buildScheduleRisk({
      id: 'risk_schedule_day1_stop',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day1',
        affectedScope: 'day-1',
      }),
      title: '同日交通偏紧',
      summary: '预计延误约 47 分钟，首项开始时间偏紧',
      affectedActivities: [
        { id: HARNESS_ACTIVITY_ID, label: '瓦特纳冰川徒步', kind: 'activity' },
      ],
    });

    const result = aggregateExecutionAlertRisks([primary, scheduleRisk]);
    expect(result.impacts.some((i) => i.type === 'DELAY')).toBe(false);
    expect(result.impacts.some((i) => i.label.includes('第 1 天'))).toBe(false);
  });

  it('does not fold cross-day schedule risks into weather primary impacts', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const day4Schedule = buildScheduleRisk({
      id: 'risk_schedule_day4',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day4',
        affectedScope: 'day-4',
      }),
      title: '第 4 天交通偏紧',
      summary: '第 4 天 · 斯瓦蒂瀑布 → 钻石沙滩：预计延误约 34 分钟',
      affectedActivities: [{ id: 'day-4', label: '第 4 天 · 斯瓦蒂瀑布 → 钻石沙滩', kind: 'activity' }],
    });
    const day5Schedule = buildScheduleRisk({
      id: 'risk_schedule_day5',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day5',
        affectedScope: 'day-5',
      }),
      title: '第 5 天交通偏紧',
      summary: '第 5 天 · 教会山 → 黑教堂：预计延误约 40 分钟',
      affectedActivities: [{ id: 'day-5', label: '第 5 天 · 教会山 → 黑教堂', kind: 'activity' }],
    });

    expect(isScheduleDerivedFromPrimary(day4Schedule, primary)).toBe(false);
    expect(isScheduleDerivedFromPrimary(day5Schedule, primary)).toBe(false);
    expect(extractRiskDayNumbers(day4Schedule)).toEqual([4]);
    expect(extractRiskDayNumbers(primary).length).toBe(0);

    const result = aggregateExecutionAlertRisks([primary, day4Schedule, day5Schedule]);
    expect(result.impacts.some((i) => i.label.includes('34'))).toBe(false);
    expect(result.impacts.some((i) => i.label.includes('40'))).toBe(false);
    expect(result.impacts.some((i) => i.label.includes('第 4 天'))).toBe(false);
    expect(result.impacts.some((i) => i.label.includes('第 5 天'))).toBe(false);
    expect(result.listAlerts.some((a) => a.risk.title.includes('第 4 天'))).toBe(false);
  });

  it('maps same-day schedule primaryRiskId to weather root cause only when linked', () => {
    const risks = buildHarnessActiveRisks();
    const primary = risks.find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const linkedSchedule = buildScheduleRisk({
      id: 'risk_schedule_day1',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day1',
        affectedScope: 'day-1',
      }),
      title: '同日交通偏紧',
      summary: '偏紧',
      affectedActivities: [
        { id: HARNESS_ACTIVITY_ID, label: '瓦特纳冰川徒步', kind: 'activity' },
      ],
    });
    const day5Schedule = buildScheduleRisk({
      id: 'risk_schedule_day5',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day5',
        affectedScope: 'day-5',
      }),
      title: '第 5 天交通偏紧',
      summary: '偏紧',
      affectedActivities: [{ id: 'day-5', label: '第 5 天 · 教会山 → 黑教堂', kind: 'activity' }],
    });

    expect(resolvePrimaryRiskId([...risks, linkedSchedule], linkedSchedule.id)).toBe(stableWindRiskId());
    expect(resolvePrimaryRiskId([...risks, day5Schedule], day5Schedule.id)).toBe(day5Schedule.id);
    expect(isScheduleDerivedFromPrimary(linkedSchedule, primary)).toBe(true);
  });

  it('folds prod-shaped travel|1 same-day schedule into impacts when route labels overlap weather primary', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const icelandWind: ActiveRisk = {
      ...primary,
      id: 'risk_d1c2afdd8e9511c0',
      title: '强风预警',
      summary: 'south_coast 路段阵风预计较强',
      affectedActivities: [
        { id: '123853b2-9580-4379-a653-291889742d31', label: '蓝湖温泉', kind: 'activity' },
        { id: '5ee5ce0c-f6a7-44f1-8232-694a9aecd12e', label: '哈尔格林姆斯教堂', kind: 'activity' },
      ],
    };
    const icelandSchedule = buildScheduleRisk({
      id: 'risk_1f48aa3d1b017e17',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'GENERIC',
        normalizedSubject: 'travel',
        affectedScope: '1',
      }),
      title: '同日交通偏紧',
      summary: '第1天 · 哈尔格林姆斯教堂 → 蓝湖温泉（约 38.6 km）：路上约需 39 分钟，首项开始时间偏早。',
      executionGate: 'STOP',
      level: 'CRITICAL',
      affectedActivities: [
        { id: 'day-1', label: '哈尔格林姆斯教堂 → 蓝湖温泉', kind: 'activity' },
      ],
      sourceRefs: [
        {
          sourceSystem: 'DECISION_PROBLEM',
          sourceId:
            'dp_travel:same_day_travel:5ee5ce0c-f6a7-44f1-8232-694a9aecd12e:123853b2-9580-4379-a653-291889742d31',
        },
      ],
    });

    expect(isScheduleDerivedFromPrimary(icelandSchedule, icelandWind)).toBe(true);

    const result = aggregateExecutionAlertRisks([icelandWind, icelandSchedule]);
    expect(result.independent.some((a) => a.risk.title === '同日交通偏紧')).toBe(false);
    expect(result.listAlerts.some((a) => a.risk.title === '同日交通偏紧')).toBe(false);
    expect(result.impacts.some((i) => i.type === 'DELAY' && i.label.includes('39'))).toBe(false);
    expect(result.impacts.some((i) => i.type === 'ITINERARY' && i.label.includes('第 1 天'))).toBe(false);
  });

  it('builds non-repetitive banner detail and action-oriented recommendation', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const aggregation = aggregateExecutionAlertRisks(buildHarnessActiveRisks());
    const detail = buildBannerDetail(primary, aggregation.impacts);

    expect(detail).not.toBe(primary.summary);
    expect(detail.length).toBeLessThanOrEqual(120);

    const rec = buildActionOrientedRecommendation({
      primary,
      requiredAction: 'STOP',
      advisoryDetail: primary.summary,
    });
    expect(rec?.detail).not.toBe(primary.summary);
    expect(rec?.title).toBe('优先确认替代路线');
  });

  it('localizes English causal impact labels for derived schedule risks when primary is AT_RISK', () => {
    const primary = {
      ...buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!,
      executionGate: 'AT_RISK' as const,
      level: 'MEDIUM' as const,
    };
    const derived = buildScheduleRisk({
      id: 'risk_drive_hours',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'GENERIC',
        normalizedSubject: 'travel',
        affectedScope: '1',
      }),
      summary: 'Driving hours exceeding safe daily limits',
      causalParentId: primary.id,
    });
    const result = aggregateExecutionAlertRisks([primary, derived]);
    expect(result.impacts.some((i) => i.label === '驾驶时长超出单日安全上限')).toBe(true);
  });

  it('localizes English ROAD_TRANSPORT causal impacts from knowledge derivation', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const crosswind: ActiveRisk = {
      ...primary,
      id: 'risk_crosswind_derived',
      type: 'ROAD_TRANSPORT',
      code: 'ROAD_SLIPPERY',
      knowledgeCode: 'ROAD-CROSSWIND-01',
      isRootCause: false,
      causalParentId: primary.id,
      title: 'Exposed road segments become dangerous for vehicles',
      summary: 'Exposed road segments become dangerous for vehicles',
      executionGate: 'AT_RISK',
      level: 'MEDIUM',
    };

    const result = aggregateExecutionAlertRisks([primary, crosswind]);
    expect(
      result.impacts.some((i) => i.label === '暴露路段横风较强，车辆通行风险升高'),
    ).toBe(true);
  });

  it('uses evaluatedAt for environment risk updatedAt when projecting live events', () => {
    const evaluatedAt = '2026-07-16T12:00:00.000Z';
    const projection = projectEnvironmentEventToRisk(harnessWindEnvironmentDetail(), {
      evaluatedAt,
    });
    expect(projection.updatedAt).toBe(evaluatedAt);
    expect(projection.detectedAt).toBe(harnessWindEnvironmentDetail().detectedAt);
  });
});
