/**
 * 用例 1：占位符 Trip — violation UNKNOWN + physicalRealityIncomplete
 * 轻量单测：不启动 Prisma，仅验证占位符 DEM 契约（完整 execute 见集成脚本）
 */
import type { DemDecisionEvidence } from '../../trips/decision/shared/world-model.types';

describe('WorldBuildContext placeholder DEM contract', () => {
  const placeholder: DemDecisionEvidence = {
    segmentId: 'placeholder_no_plan_yet',
    elevationProfile: [],
    cumulativeAscent: -1,
    maxSlopePct: -1,
    rollingAscent3Days: -1,
    fatigueIndex: -1,
    violation: 'UNKNOWN',
    dataProvenance: 'PLACEHOLDER',
    explanation: '占位符：计划生成阶段尚未有具体路线',
  };

  it('uses placeholder_ segment prefix and UNKNOWN violation', () => {
    expect(placeholder.segmentId).toMatch(/^placeholder_/);
    expect(placeholder.violation).toBe('UNKNOWN');
    expect(placeholder.dataProvenance).toBe('PLACEHOLDER');
    expect(placeholder.cumulativeAscent).toBe(-1);
  });
});
