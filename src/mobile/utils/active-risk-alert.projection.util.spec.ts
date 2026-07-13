import {
  buildExecutionAlertsFromActiveRisks,
  extractAssessmentSupplement,
  isAlertCausalHeadlineRedundant,
  projectActiveRiskToExecutionAlert,
  reconcilePrimaryRecommendedAction,
} from './active-risk-alert.projection.util';
import { EXECUTION_ALERTS_SCHEMA_V2_ID } from '../../trips/execution-risk-center/utils/execution-intervention.projection.util';
import { buildHarnessActiveRisks, stableWindRiskId, HARNESS_TRIP_ID } from '../../trips/execution-risk-center/harness/execution-risk-p0.harness.util';
import type { ActiveRisk } from '../../trips/execution-risk-center/types/execution-risk.types';
import { buildRiskKey } from '../../trips/execution-risk-center/utils/risk-key.util';

describe('active-risk-alert.projection.util', () => {
  it('projects wind risk to execution alert with riskId and impact summary', () => {
    const risk = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const alert = projectActiveRiskToExecutionAlert(risk);
    expect(alert.riskId).toBe(risk.id);
    expect(alert.riskKey).toBe(risk.riskKey);
    expect(alert.title).toContain('强风预警');
    expect(alert.title).toContain('不建议按原计划出发');
    expect(alert.affectedActivities.length).toBeGreaterThan(0);
    expect(alert.recommendationIds?.length).toBeGreaterThan(0);
  });

  it('builds execution alerts dto from active risks with ERC projection source', () => {
    const risks = buildHarnessActiveRisks();
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: 'trip_1',
      contextVersion: 1,
      risks,
      summaryHeadline: '关注强风',
      summaryDetail: '建议调整下午行程',
    });
    expect(dto.schemaId).toBe(EXECUTION_ALERTS_SCHEMA_V2_ID);
    expect(dto.projectionSource).toBe('execution_risk_center');
    expect(dto.primaryRisk?.riskId).toBe(stableWindRiskId());
    expect(dto.primaryRisk?.presentationRole).toBe('PRIMARY');
    expect(dto.alerts.some((a) => a.riskId === dto.primaryRisk?.riskId)).toBe(false);
    expect(dto.alerts).toEqual(dto.independentRisks);
    expect(dto.impacts?.length).toBeGreaterThan(0);
    expect(dto.alerts.every((a) => a.presentationRole !== 'IMPACT')).toBe(true);
    expect(dto.aiRecommendation.headline).toBe('关注强风');
    expect(dto.aiRecommendation.detail).not.toBe(dto.primaryRisk?.reason);
  });

  it('maps STOP execution gate to STOP alert level', () => {
    const risks = buildHarnessActiveRisks();
    const stop = risks.find((r) => r.executionGate === 'STOP');
    expect(stop).toBeDefined();
    const alert = projectActiveRiskToExecutionAlert(stop!);
    expect(alert.level).toBe('STOP');
    expect(alert.requiresImmediateAttention).toBe(true);
  });

  it('excludes schedule tightness risks from execution alerts', () => {
    const scheduleRisk: ActiveRisk = {
      ...buildHarnessActiveRisks()[0]!,
      id: 'risk_schedule_test',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day1',
        affectedScope: 'day-1',
      }),
      type: 'SCHEDULE',
      code: 'SCHEDULE_DELAY',
      title: '同日交通偏紧',
      summary: 'Day 1 路面耗时偏长',
      executionGate: 'REPLAN_REQUIRED',
      level: 'HIGH',
      sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'dp-traffic' }],
      decisionProblemIds: ['dp-traffic'],
    };

    const risks = [...buildHarnessActiveRisks(), scheduleRisk];
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks,
    });

    expect(dto.alerts.some((a) => a.title === '同日交通偏紧')).toBe(false);
    expect(dto.alerts.some((a) => a.riskId === scheduleRisk.id)).toBe(false);
    expect(dto.impacts?.some((i) => i.type === 'DELAY')).toBe(false);
    expect(dto.aiRecommendation.basedOnRiskIds).not.toContain(scheduleRisk.id);
  });

  it('does not include cross-day schedule delays in impacts under weather primary', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const day4Schedule: ActiveRisk = {
      ...primary,
      id: 'risk_schedule_day4',
      riskKey: buildRiskKey({
        tripId: HARNESS_TRIP_ID,
        type: 'SCHEDULE',
        code: 'SCHEDULE_DELAY',
        normalizedSubject: 'same_day_travel:day4',
        affectedScope: 'day-4',
      }),
      type: 'SCHEDULE',
      code: 'SCHEDULE_DELAY',
      title: '第 4 天交通偏紧',
      summary: '第 4 天 · 预计延误约 34 分钟',
      executionGate: 'REPLAN_REQUIRED',
      level: 'HIGH',
      affectedActivities: [{ id: 'day-4', label: '第 4 天 · 钻石沙滩', kind: 'activity' }],
      sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: 'dp-day4' }],
      decisionProblemIds: ['dp-day4'],
    };

    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks: [primary, day4Schedule],
    });

    expect(dto.impacts?.some((i) => i.label.includes('34'))).toBe(false);
    expect(dto.impacts?.some((i) => i.label.includes('第 4 天'))).toBe(false);
  });

  it('does not duplicate attention weather as independent alert when wind is primary', () => {
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks: buildHarnessActiveRisks(),
    });
    const attentionTitles = dto.alerts.filter((a) => a.title.includes('强风预警'));
    expect(attentionTitles.length).toBeLessThanOrEqual(1);
    expect(dto.requiredAction).toBe('STOP');
  });

  it('puts title/reason/recommendedAction only on primaryRisk and independentRisks', () => {
    const assessment =
      'south_coast 阵风约 12 m/s。P90 行驶时间 1h24m。错过预约概率 78%。最小干预建议将出发时间提前 20 分钟。';
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks: buildHarnessActiveRisks(),
      summaryDetail: assessment,
      summaryRecommendedAction: '将蓝湖温泉的时间提早20分钟',
    });

    expect(dto.primaryRisk?.title).toBeTruthy();
    expect(dto.primaryRisk?.reason).toContain('P90');
    expect(dto.primaryRisk?.reason).not.toContain('最小干预建议');
    expect(dto.primaryRisk?.recommendedAction).toBeUndefined();

    for (const impact of dto.impacts ?? []) {
      expect(impact).not.toHaveProperty('title');
      expect(impact).not.toHaveProperty('reason');
      expect(impact).not.toHaveProperty('recommendedAction');
    }
  });

  it('passes advisory causalStory chain onto primaryRisk.causalChain', () => {
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks: buildHarnessActiveRisks(),
      causalInsight: {
        guardianHeadline: '安全提示：强风下不建议按原计划出发',
        primaryEnforcement: 'NOT_EXECUTABLE',
        causalStory: {
          assessment: '侧风可能使 P90 超出计划缓冲。',
          chain: [
            {
              nodeId: 'world_wind',
              type: 'WORLD_CHANGE',
              title: '天气影响',
              description: '路段阵风约 18 m/s',
            },
            {
              nodeId: 'eff_p90',
              type: 'IMPACT',
              title: '通行耗时',
              description: 'P90 预计增加 17 分钟',
            },
            {
              nodeId: 'conflict',
              type: 'CONFLICT',
              title: '决策冲突',
              description: '按原计划出发可能错过预约',
            },
            {
              nodeId: 'option',
              type: 'OPTION',
              title: '建议',
              description: '将蓝湖温泉的时间提早20分钟',
            },
          ],
        },
      },
    });

    expect(dto.primaryRisk?.causalChain?.nodes).toHaveLength(3);
    expect(dto.primaryRisk?.causalChain?.nodes[0]?.type).toBe('WORLD_CHANGE');
    expect(dto.primaryRisk?.causalChain?.headline).toContain('安全提示');
    expect(dto.primaryRisk?.causalChain?.assessment).toContain('P90');
    expect(dto.primaryRisk?.causalChain?.nodes.some((n) => n.type === 'OPTION')).toBe(false);
    expect(dto.independentRisks?.[0]?.causalChain).toBeUndefined();
  });

  it('dedupes causalChain assessment when it repeats primaryRisk.reason', () => {
    const assessment =
      'south_coast 路段阵风预计较强（约 12 m/s）。按照当前车型和路况，蓝湖温泉 → 哈尔格林姆斯教堂 的 P90 行驶时间约为 1 小时 27 分（基准 48 分）。保持当前出发时间，错过集合/预约的概率约为 79%。最小干预建议将出发时间提前 20 分钟。';
    const reason =
      'south_coast 路段阵风预计较强（约 12 m/s）。按照当前车型和路况，蓝湖温泉 → 哈尔格林姆斯教堂 的 P90 行驶时间约为 1 小时 27 分（基准 48 分）。保持当前出发时间，错过集合/预约的概率约为 79%。';

    expect(extractAssessmentSupplement(assessment, reason)).toBe(
      '最小干预建议将出发时间提前 20 分钟。',
    );
    expect(isAlertCausalHeadlineRedundant(
      '安全提示：蓝湖温泉 → 哈尔格林姆斯教堂 强风下不建议按原计划出发',
      '蓝湖温泉 → 哈尔格林姆斯教堂：暴雨预警路面湿滑且侧风12m/s，不建议按原计划出发',
    )).toBe(true);

    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks: buildHarnessActiveRisks(),
      summaryDetail: assessment,
      summaryRecommendedAction: '将蓝湖温泉的时间提早20分钟',
      causalInsight: {
        guardianHeadline: '安全提示：蓝湖温泉 → 哈尔格林姆斯教堂 强风下不建议按原计划出发',
        primaryEnforcement: 'NOT_EXECUTABLE',
        causalStory: {
          assessment,
          chain: [
            {
              nodeId: 'world_wind',
              type: 'WORLD_CHANGE',
              title: '天气影响',
              description: '预计出现 12 m/s 阵风，影响路段通行速度',
            },
            {
              nodeId: 'eff_p90',
              type: 'IMPACT',
              title: '通行耗时',
              description: '该路段 P90 通行时间增加约 24 分钟',
            },
            {
              nodeId: 'conflict',
              type: 'CONFLICT',
              title: '决策冲突',
              description: assessment.slice(0, 120),
            },
            {
              nodeId: 'option',
              type: 'OPTION',
              title: '建议',
              description: '将蓝湖温泉的时间提早20分钟',
            },
          ],
        },
      },
    });

    expect(dto.primaryRisk?.reason).not.toContain('最小干预建议');
    expect(dto.primaryRisk?.causalChain?.assessment).toBe('');
    expect(dto.primaryRisk?.causalChain?.nodes.some((n) => n.type === 'OPTION')).toBe(false);
  });

  it('falls back to risk causal chain when advisory chain is empty', () => {
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks: buildHarnessActiveRisks(),
      causalInsight: {
        guardianHeadline: '安全提示',
        primaryEnforcement: 'NOT_EXECUTABLE',
        causalStory: { assessment: '侧风影响通行', chain: [] },
      },
    });

    expect(dto.primaryRisk?.causalChain?.nodes.length).toBeGreaterThan(0);
    expect(dto.primaryRisk?.causalChain?.nodes[0]?.type).toBe('WORLD_CHANGE');
  });

  it('suppresses keep-original recommendedAction when requiredAction is STOP', () => {
    expect(
      reconcilePrimaryRecommendedAction({
        recommendedAction: '保持原计划',
        requiredAction: 'STOP',
        level: 'STOP',
      }),
    ).toBeUndefined();

    const risks = buildHarnessActiveRisks();
    const dto = buildExecutionAlertsFromActiveRisks({
      tripId: HARNESS_TRIP_ID,
      contextVersion: 1,
      risks,
      summaryRecommendedAction: '保持原计划',
    });
    if (dto.requiredAction === 'STOP' || dto.primaryRisk?.level === 'STOP') {
      expect(dto.primaryRisk?.recommendedAction).toBeUndefined();
    }
  });
});
