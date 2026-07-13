import {
  projectExecutionAlertCopy,
  resolveAuthoritativeWindMps,
  splitAssessmentAndRecommendation,
} from './execution-alert-copy.util';
import type { ActiveRisk } from '../types/execution-risk.types';

const icelandAssessment =
  'south_coast 路段阵风预计较强 (约 12 m/s)。按照当前车型和路况，蓝湖温泉 -> 哈尔格林姆斯教堂 的 P90 行驶时间约为 1 小时 24 分 (基准 47 分)。保持当前出发时间，错过集合/预约的概率约为 78%。最小干预建议将出发时间提前 20 分钟。';

function weatherRisk(overrides: Partial<ActiveRisk> = {}): ActiveRisk {
  return {
    id: 'risk_weather',
    riskKey: 'k',
    tripId: 'trip_1',
    type: 'ENVIRONMENT',
    code: 'WEATHER_HEAVY_RAIN',
    title: '暴雨预警',
    summary: 'south_coast 路段侧风预计达 22 m/s，路面湿滑',
    level: 'HIGH',
    executionGate: 'STOP',
    lifecycleStatus: 'ACTIVE',
    acknowledgementStatus: 'UNSEEN',
    treatmentStatus: 'ACTION_REQUIRED',
    detectedAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    affectedMembers: [],
    affectedActivities: [
      { id: 'a1', label: '蓝湖温泉', kind: 'activity' },
      { id: 'a2', label: '哈尔格林姆斯教堂', kind: 'activity' },
    ],
    affectedLocations: [],
    affectedRouteSegments: [],
    sourceRefs: [],
    evidenceRefs: [],
    recommendationIds: ['env-rec-1-plan-advance'],
    interventionIds: [],
    decisionProblemIds: [],
    ...overrides,
  };
}

describe('execution-alert-copy.util', () => {
  it('splits title / reason / recommendedAction for iceland-style assessment', () => {
    const copy = projectExecutionAlertCopy(weatherRisk(), {
      assessmentText: icelandAssessment,
    });

    expect(copy.title).toBe(
      '蓝湖温泉 → 哈尔格林姆斯教堂：暴雨预警路面湿滑且侧风12m/s，不建议按原计划出发',
    );
    expect(copy.reason).toContain('P90 行驶时间约为 1 小时 24 分');
    expect(copy.reason).toContain('错过集合/预约的概率约为 78%');
    expect(copy.reason).not.toContain('最小干预建议');
    expect(copy.recommendedAction).toBe('将蓝湖温泉的时间提早20分钟');
  });

  it('uses explicit recommendedAction override', () => {
    const copy = projectExecutionAlertCopy(weatherRisk(), {
      assessmentText: icelandAssessment,
      recommendedAction: '将蓝湖温泉的时间提早 20 分钟',
    });
    expect(copy.recommendedAction).toBe('将蓝湖温泉的时间提早 20 分钟');
  });

  it('splitAssessmentAndRecommendation extracts advance minutes', () => {
    const split = splitAssessmentAndRecommendation(icelandAssessment);
    expect(split.advanceMinutes).toBe(20);
    expect(split.body).not.toMatch(/最小干预建议/);
  });

  it('uses advisory wind for title when env copy reports a different peak gust', () => {
    const assessment =
      'south_coast 路段阵风预计较强（约 12 m/s）。按照当前车型和路况，蓝湖温泉 → 哈尔格林姆斯教堂 的 P90 行驶时间约为 1 小时 10 分（基准 39 分）。保持当前出发时间，错过集合/预约的概率约为 71%。';
    const copy = projectExecutionAlertCopy(
      weatherRisk({
        code: 'WEATHER_STRONG_WIND',
        title: '强风预警',
        summary: '蓝湖温泉 → 哈尔格林姆斯教堂：暴雨预警，路面湿滑且侧风 22 m/s，不建议按原计划出发',
        observedMetrics: { WIND_GUST_MPS: 22, WIND_SUSTAINED_MPS: 22 },
      }),
      { assessmentText: assessment },
    );

    expect(resolveAuthoritativeWindMps(weatherRisk(), { assessmentText: assessment })).toBe(12);
    expect(copy.title).toContain('侧风12m/s');
    expect(copy.title).not.toContain('22m/s');
    expect(copy.reason).toContain('12 m/s');
  });

  it('localizes ash-fall causal derivation into distinct title and reason', () => {
    const copy = projectExecutionAlertCopy(
      weatherRisk({
        code: 'GENERIC',
        title: 'Ash fall degrading air quality to hazardous levels',
        summary: 'Ash fall degrading air quality to hazardous levels',
        executionGate: 'REPLAN_REQUIRED',
        level: 'HIGH',
        affectedActivities: [],
      }),
    );

    expect(copy.title).toBe('当前路段：火山灰预警，不建议按原计划出发');
    expect(copy.reason).toBe('火山灰沉降可能导致空气质量降至危险水平，不建议按原计划进入受影响区域。');
    expect(copy.title).not.toBe(copy.reason);
  });
});
