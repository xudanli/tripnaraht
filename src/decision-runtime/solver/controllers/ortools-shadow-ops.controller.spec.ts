import { OrToolsShadowOpsController } from './ortools-shadow-ops.controller';
import { OrToolsShadowMetricsCollector } from '../observability/ortools-shadow-metrics.collector';

describe('OrToolsShadowOpsController', () => {
  const prevObs = process.env.OR_TOOLS_SHADOW_OBSERVABILITY_ENABLED;
  const prevMetrics = process.env.OR_TOOLS_SHADOW_METRICS_DISABLED;

  afterEach(() => {
    if (prevObs === undefined) delete process.env.OR_TOOLS_SHADOW_OBSERVABILITY_ENABLED;
    else process.env.OR_TOOLS_SHADOW_OBSERVABILITY_ENABLED = prevObs;
    if (prevMetrics === undefined) delete process.env.OR_TOOLS_SHADOW_METRICS_DISABLED;
    else process.env.OR_TOOLS_SHADOW_METRICS_DISABLED = prevMetrics;
  });

  it('health reports non-authoritative MVP ops', () => {
    const ctl = new OrToolsShadowOpsController(new OrToolsShadowMetricsCollector());
    const res = ctl.health() as {
      data: {
        writeAuthority: boolean;
        mvpOperations: string[];
        planningOrchestratorShadow: {
          intents: string[];
          shadowAuthority: boolean;
        };
      };
    };
    expect(res.data.writeAuthority).toBe(false);
    expect(res.data.mvpOperations).toContain('SHORTEN');
    expect(res.data.mvpOperations).toContain('REPLACE');
    expect(res.data.planningOrchestratorShadow.intents).toContain('AUTO_ARRANGE');
    expect(res.data.planningOrchestratorShadow.shadowAuthority).toBe(false);
  });

  it('metrics returns snapshot when enabled', () => {
    delete process.env.OR_TOOLS_SHADOW_METRICS_DISABLED;
    const metrics = new OrToolsShadowMetricsCollector();
    const ctl = new OrToolsShadowOpsController(metrics);
    const res = ctl.metricsSnapshot() as { data: { schemaId: string; runsTotal: number } };
    expect(res.data.schemaId).toBe('tripnara.ortools_shadow_metrics@v1');
    expect(res.data.runsTotal).toBe(0);
  });

  it('planning-lab/compare returns rollups without promotion', () => {
    delete process.env.OR_TOOLS_SHADOW_METRICS_DISABLED;
    const metrics = new OrToolsShadowMetricsCollector();
    metrics.recordPlanningLabCompare({
      schemaId: 'tripnara.ortools_planning_lab_compare@v1',
      dayIndex: 1,
      authoritativePromotion: false,
      shadowAuthority: false,
      baseOrder: ['a1', 'a2'],
      legacyOrder: ['a2', 'a1'],
      shadowOrder: ['a1', 'a2'],
      legacyBaseDisorder: 1,
      shadowBaseDisorder: 0,
      legacyShadowOrderAgreement: 0,
      travelDeltaLegacyMinusShadow: 12,
      legacyChangeCount: 2,
      shadowChangeCount: 0,
      itemsCompared: 2,
      notes: [],
      generatedAt: new Date().toISOString(),
      tripId: 't1',
    });
    const ctl = new OrToolsShadowOpsController(metrics);
    const res = ctl.planningLabCompare() as {
      data: {
        authoritativePromotion: boolean;
        planningLabCompareTotal: number;
        planningLabShadowCheaperTotal: number;
      };
    };
    expect(res.data.authoritativePromotion).toBe(false);
    expect(res.data.planningLabCompareTotal).toBe(1);
    expect(res.data.planningLabShadowCheaperTotal).toBe(1);
  });
});
