import { applyActiveRiskUserFacingCopy } from './active-risk-display-copy.util';
import type { ActiveRisk } from '../types/execution-risk.types';

const assessment12 =
  'south_coast 路段阵风预计较强（约 12 m/s）。按照当前车型和路况，蓝湖温泉 → 哈尔格林姆斯教堂 的 P90 行驶时间约为 1 小时 10 分（基准 39 分）。';

function ashRisk(): ActiveRisk {
  return {
    id: 'risk_ash',
    riskKey: 'trip|ENVIRONMENT|GENERIC|derived|risk_parent|open/open',
    tripId: 'trip_1',
    type: 'ENVIRONMENT',
    code: 'GENERIC',
    title: 'Ash fall degrading air quality to hazardous levels',
    summary: 'Ash fall degrading air quality to hazardous levels',
    level: 'HIGH',
    executionGate: 'REPLAN_REQUIRED',
    lifecycleStatus: 'ACTIVE',
    acknowledgementStatus: 'UNSEEN',
    treatmentStatus: 'ACTION_REQUIRED',
    detectedAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    affectedMembers: [],
    affectedActivities: [],
    affectedLocations: [],
    affectedRouteSegments: [],
    sourceRefs: [],
    evidenceRefs: [],
    recommendationIds: [],
    interventionIds: [],
    decisionProblemIds: [],
  };
}

describe('active-risk-display-copy.util', () => {
  it('splits duplicate title/summary for user-facing read APIs', () => {
    const projected = applyActiveRiskUserFacingCopy(ashRisk());
    expect(projected.title).toBe('当前路段：火山灰预警，不建议按原计划出发');
    expect(projected.summary).toContain('火山灰沉降');
    expect(projected.title).not.toBe(projected.summary);
  });

  it('aligns wind title with advisory assessment over env peak gust copy', () => {
    const wind: ActiveRisk = {
      ...ashRisk(),
      id: 'risk_wind',
      type: 'ENVIRONMENT',
      code: 'WEATHER_STRONG_WIND',
      title: '强风预警',
      summary: '蓝湖温泉 → 哈尔格林姆斯教堂：暴雨预警，路面湿滑且侧风 22 m/s',
      observedMetrics: { WIND_GUST_MPS: 22 },
    };
    const projected = applyActiveRiskUserFacingCopy(wind, { assessmentText: assessment12 });
    expect(projected.title).toContain('侧风12m/s');
    expect(projected.summary).toContain('12 m/s');
  });

  it('does not apply wind advisory copy onto volcanic ash derived risks', () => {
    const ash: ActiveRisk = {
      ...ashRisk(),
      id: 'risk_ash_volc',
      code: 'GENERIC',
      knowledgeCode: 'ENV-FIRE-02',
      generationMode: 'CAUSAL_DERIVATION',
      title: 'Ash fall degrading air quality to hazardous levels',
      summary: 'Ash fall degrading air quality to hazardous levels',
    };
    const projected = applyActiveRiskUserFacingCopy(ash, { assessmentText: assessment12 });
    expect(projected.title).toBe('当前路段：火山灰预警，不建议按原计划出发');
    expect(projected.summary).toContain('火山灰沉降');
    expect(projected.title).not.toContain('12m/s');
  });
});
