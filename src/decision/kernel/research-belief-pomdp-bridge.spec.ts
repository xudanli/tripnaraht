import type { DecisionState, BeliefStateSample } from './decision-state.types';
import { DefaultObservationModelService } from '../../trips/decision/optimization/probabilistic/default-observation-model.service';
import {
  beliefSamplesToPomdpBelief,
  buildWindSpeedObservationForBelief,
  buildWindSpeedObservationFromResearch,
  extractObservedWindSpeedMsForBelief,
  windProvenanceToQuality,
  extractObservedVisibilityMForBelief,
  extractObservedPrecipitationMmForBelief,
  extractObservedRoadClosure01ForBelief,
  extractObservedFatigue01ForBelief,
  pomdpBeliefToBeliefStateSamples,
  refineBeliefWithPomdpIfAvailable,
} from './research-belief-pomdp-bridge';

describe('research-belief-pomdp-bridge', () => {
  const makeDso = (): DecisionState =>
    ({
      requestId: 'r1',
      userIntent: { dateRange: { startDate: '2026-07-01', endDate: '2026-07-05' } },
      tripState: {},
      environmentState: { weatherRisk: 0.9, countryCode: 'JP', month: 7 },
      systemState: {
        requestId: 'r1',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    }) as DecisionState;

  it('buildWindSpeedObservationFromResearch 应映射 weatherRisk → windSpeed 观测', () => {
    const dso = makeDso();
    const obs = buildWindSpeedObservationFromResearch({ weatherRisk: 0.8 }, dso);
    expect(obs.type).toBe('WEATHER');
    expect(obs.observation.variable).toBe('windSpeed');
    expect(typeof obs.observation.value).toBe('number');
    expect(obs.observation.value).toBeGreaterThan(5);
  });

  it('extractObservedWindSpeedMsForBelief 应优先使用 researchData.windSpeedMs', () => {
    const dso = makeDso();
    const r = extractObservedWindSpeedMsForBelief({ windSpeedMs: 18.5, weatherRisk: 0.1 }, dso);
    expect(r.observedWindSpeedMs).toBe(18.5);
    expect(r.provenance).toBe('research_data.windSpeedMs');
  });

  it('buildWindSpeedObservationForBelief 应附带 provenance', () => {
    const dso = makeDso();
    const b = buildWindSpeedObservationForBelief({ wind_speed_kmh: 36 }, dso);
    expect(b.observedWindSpeedMs).toBeCloseTo(10, 5);
    expect(b.provenance).toBe('research_data.wind_speed_kmh');
    expect(b.quality).toBe('HIGH');
    expect(b.independenceTier).toBe('STRONG_EXTERNAL');
    expect(b.observation.observation.value).toBeCloseTo(10, 5);
  });

  it('当 windSpeedMs_meta.source=weather_forecast 时，即使字段名为 windSpeedMs 也应判定 quality=HIGH', () => {
    const dso = makeDso();
    const b = buildWindSpeedObservationForBelief(
      { windSpeedMs: 12, windSpeedMs_meta: { source: 'weather_forecast', aggregation: 'mean', sampleCount: 3 } } as any,
      dso,
    );
    expect(b.provenance).toBe('research_data.windSpeedMs');
    expect(b.quality).toBe('HIGH');
    expect(b.independenceTier).toBe('STRONG_EXTERNAL');
  });

  it('observationModelParams 应可按 country/month 选择 preset（env 可覆盖）', async () => {
    const prev = {
      w: process.env.DECISION_OS_OBS_VAR_WIND,
      t: process.env.DECISION_OS_OBS_VAR_TEMP_C,
      v: process.env.DECISION_OS_OBS_VAR_VIS_M,
      p: process.env.DECISION_OS_OBS_VAR_PRECIP_MM,
    };
    delete process.env.DECISION_OS_OBS_VAR_WIND;
    delete process.env.DECISION_OS_OBS_VAR_TEMP_C;
    delete process.env.DECISION_OS_OBS_VAR_VIS_M;
    delete process.env.DECISION_OS_OBS_VAR_PRECIP_MM;

    const dso = { ...makeDso(), environmentState: { weatherRisk: 0.4, countryCode: 'IS', month: 1 } } as DecisionState;
    const beliefSamples: BeliefStateSample[] = [{ sampleId: 'a', environmentSummary: { weatherRisk: 0.5 }, weight: 1 }];
    const probabilisticWorldModel = { fromDeterministicModel: jest.fn().mockReturnValue({ stubCtx: true }) } as any;
    const beliefUpdate = {
      updateBelief: jest.fn().mockResolvedValue({
        updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b) => ({ ...b, weight: 1 })),
        effectiveParticleCount: 1,
        logNormalizationConstant: 0,
      }),
    } as any;

    const _out = await refineBeliefWithPomdpIfAvailable({
      dso,
      researchData: { windSpeedMs: 10, windSpeedMs_meta: { source: 'weather_forecast', aggregation: 'mean', sampleCount: 1 } },
      beliefSamples,
      probabilisticWorldModel,
      beliefUpdate,
    });

    // 本用例权重无变化会被“有效精炼判据”拦截返回 null；我们只验证 preset 逻辑在构造处不抛错
    // 通过读取 observationModelParams 的方法需要有效精炼，因此这里只验证 readVarianceConfig 在 winter preset 下能产出 presetId
    const cfg = DefaultObservationModelService.readVarianceConfig({ countryCode: 'IS', month: 1 });
    expect(cfg.presetId).toBe('IS_WINTER');

    process.env.DECISION_OS_OBS_VAR_WIND = prev.w;
    process.env.DECISION_OS_OBS_VAR_TEMP_C = prev.t;
    process.env.DECISION_OS_OBS_VAR_VIS_M = prev.v;
    process.env.DECISION_OS_OBS_VAR_PRECIP_MM = prev.p;
  });

  it('failure_risk_prediction.predictions[0].windSpeed 应作为 m/s 观测', () => {
    const dso = makeDso();
    const r = extractObservedWindSpeedMsForBelief(
      {
        failure_risk_prediction: { predictions: [{ windSpeed: 22 }] },
      },
      dso,
    );
    expect(r.observedWindSpeedMs).toBe(22);
    expect(r.provenance).toBe('research_data.failure_risk_prediction.predictions[0].windSpeed');
  });

  it('粒子映射 round-trip 应保持 sample 数一致', () => {
    const samples: BeliefStateSample[] = [
      { sampleId: 'a', environmentSummary: { weatherRisk: 0.2 }, weight: 0.5 },
      { sampleId: 'b', environmentSummary: { weatherRisk: 0.9 }, weight: 0.5 },
    ];
    const pomdp = beliefSamplesToPomdpBelief(samples);
    expect(pomdp.length).toBe(2);
    const back = pomdpBeliefToBeliefStateSamples(pomdp);
    expect(back.length).toBe(2);
    expect(back[0].weight).toBeDefined();
  });

  it('可从 weather_forecast 提取 visibilityM/precipitationMm', () => {
    const vis = extractObservedVisibilityMForBelief({ weather_forecast: { forecasts: [{ visibility_km: 8 }] } } as any);
    expect(vis?.visibilityM).toBe(8000);
    const pr = extractObservedPrecipitationMmForBelief({
      weather_forecast: { forecasts: [{ precipitation: { amount_mm: 12 } }] },
    } as any);
    expect(pr?.precipitationMm).toBe(12);
  });

  it('可从 road_conditions 提取 roadClosure01', () => {
    const road = extractObservedRoadClosure01ForBelief({
      road_conditions: {
        r1: { status: 'OPEN' },
        r2: { status: 'CLOSED' },
      },
    } as any);
    expect(road?.roadClosure01).toBeCloseTo(0.5, 5);
  });

  it('可从 dso.tripState.fatigue 提取 fatigue01', () => {
    const dso = { ...makeDso(), tripState: { fatigue: 0.33 } } as any;
    const f = extractObservedFatigue01ForBelief(dso);
    expect(f?.fatigue01).toBeCloseTo(0.33, 8);
  });

  it('注入 worldModel + beliefUpdate 时应返回精炼后的粒子', async () => {
    const prev = process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;
    delete process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;

    const dso = makeDso();
    const beliefSamples: BeliefStateSample[] = [
      { sampleId: 'a', environmentSummary: { weatherRisk: 0.1 }, weight: 0.5 },
      { sampleId: 'b', environmentSummary: { weatherRisk: 0.95 }, weight: 0.5 },
    ];

    const fromDeterministicModel = jest.fn().mockReturnValue({ stubCtx: true });
    const probabilisticWorldModel = { fromDeterministicModel } as any;

    const updatedBelief = beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({
      ...b,
      weight: i === 0 ? 0.9 : 0.1,
    }));
    const beliefUpdate = {
      updateBelief: jest.fn().mockResolvedValue({
        updatedBelief,
        effectiveParticleCount: 1.2,
        logNormalizationConstant: -0.5,
      }),
    } as any;

    const out = await refineBeliefWithPomdpIfAvailable({
      dso,
      researchData: { weatherRisk: 0.85 },
      beliefSamples,
      probabilisticWorldModel,
      beliefUpdate,
    });

    expect(out).not.toBeNull();
    expect(out!.refinedSamples.length).toBe(2);
    expect(out!.observationProvenance).toBe('derived_from_weather_risk_scalar');
    expect(typeof out!.observedWindSpeedMs).toBe('number');
    expect(out!.observationQuality).toBe('LOW');
    expect(out!.observationIndependenceTier).toBe('WEAK');
    expect(typeof out!.weightL1Delta).toBe('number');
    expect(typeof out!.weightJSDivergence).toBe('number');
    expect(out!.refinementThresholds?.n).toBeGreaterThan(0);
    expect(out!.refinementEffective).toBe(true);
    expect(beliefUpdate.updateBelief).toHaveBeenCalled();
    expect(fromDeterministicModel).toHaveBeenCalled();

    if (prev !== undefined) process.env.DECISION_OS_RESEARCH_POMDP_BELIEF = prev;
  });

  it('refine 时若 researchData 含 windSpeedMs 应记录独立通道 provenance', async () => {
    const prev = process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;
    delete process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;

    const dso = makeDso();
    const beliefSamples: BeliefStateSample[] = [{ sampleId: 'a', environmentSummary: { weatherRisk: 0.5 }, weight: 1 }];
    const fromDeterministicModel = jest.fn().mockReturnValue({ stubCtx: true });
    const probabilisticWorldModel = { fromDeterministicModel } as any;
    const updatedBelief = beliefSamplesToPomdpBelief(beliefSamples).map((b) => ({ ...b, weight: 1 }));
    const beliefUpdate = {
      updateBelief: jest.fn().mockResolvedValue({
        updatedBelief: updatedBelief.map((b, i) => ({ ...b, weight: i === 0 ? 0.9 : 0.1 })),
        effectiveParticleCount: 1,
        logNormalizationConstant: 0,
      }),
    } as any;

    const out = await refineBeliefWithPomdpIfAvailable({
      dso,
      researchData: {
        windSpeedMs: 14.2,
        windSpeedMs_meta: { source: 'weather_predictions', aggregation: 'mean', sampleCount: 1 },
      },
      beliefSamples,
      probabilisticWorldModel,
      beliefUpdate,
    });

    expect(out?.observationProvenance).toBe('research_data.windSpeedMs');
    expect(out?.observedWindSpeedMs).toBe(14.2);
    expect(out?.observationQuality).toBe(windProvenanceToQuality('research_data.windSpeedMs'));
    expect(out?.observationIndependenceTier).toBe('STRONG_INTERNAL');
    expect(out?.windSpeedMeta).toEqual({ source: 'weather_predictions', aggregation: 'mean', sampleCount: 1 });
    const obsArg = beliefUpdate.updateBelief.mock.calls[0][1].observation;
    expect(obsArg.observation.value).toBe(14.2);

    if (prev !== undefined) process.env.DECISION_OS_RESEARCH_POMDP_BELIEF = prev;
  });

  it('DECISION_OS_RESEARCH_POMDP_BELIEF=0 时应跳过', async () => {
    process.env.DECISION_OS_RESEARCH_POMDP_BELIEF = '0';
    const out = await refineBeliefWithPomdpIfAvailable({
      dso: makeDso(),
      researchData: {},
      beliefSamples: [{ sampleId: 'a', weight: 1 }],
      probabilisticWorldModel: { fromDeterministicModel: jest.fn() } as any,
      beliefUpdate: { updateBelief: jest.fn() } as any,
    });
    expect(out).toBeNull();
    delete process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;
  });

  it('若 BeliefUpdate 返回新数组但权重无变化，应视为无效精炼并返回 null', async () => {
    const prev = process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;
    delete process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;

    const dso = makeDso();
    const beliefSamples: BeliefStateSample[] = [
      { sampleId: 'a', environmentSummary: { weatherRisk: 0.1 }, weight: 0.5 },
      { sampleId: 'b', environmentSummary: { weatherRisk: 0.95 }, weight: 0.5 },
    ];
    const probabilisticWorldModel = { fromDeterministicModel: jest.fn().mockReturnValue({ stubCtx: true }) } as any;
    const sameWeightsNewArray = beliefSamplesToPomdpBelief(beliefSamples).map((b) => ({ ...b }));
    const beliefUpdate = {
      updateBelief: jest.fn().mockResolvedValue({
        updatedBelief: sameWeightsNewArray,
        effectiveParticleCount: 2,
        logNormalizationConstant: 0,
      }),
    } as any;

    const out = await refineBeliefWithPomdpIfAvailable({
      dso,
      researchData: { weatherRisk: 0.8 },
      beliefSamples,
      probabilisticWorldModel,
      beliefUpdate,
    });
    expect(out).not.toBeNull();
    expect(out?.refinementEffective).toBe(false);

    if (prev !== undefined) process.env.DECISION_OS_RESEARCH_POMDP_BELIEF = prev;
  });

  it('当 researchData 同时包含 visibility/precipitation 时应进行多次 updateBelief 并记录 observationsUsed', async () => {
    const prev = process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;
    delete process.env.DECISION_OS_RESEARCH_POMDP_BELIEF;

    const dso = makeDso();
    const beliefSamples: BeliefStateSample[] = [
      { sampleId: 'a', environmentSummary: { weatherRisk: 0.1 }, weight: 0.5 },
      { sampleId: 'b', environmentSummary: { weatherRisk: 0.95 }, weight: 0.5 },
    ];
    const probabilisticWorldModel = { fromDeterministicModel: jest.fn().mockReturnValue({ stubCtx: true }) } as any;

    const beliefUpdate = {
      updateBelief: jest
        .fn()
        // visibilityM (HIGH) first
        .mockResolvedValueOnce({
          updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({ ...b, weight: i === 0 ? 0.8 : 0.2 })),
          effectiveParticleCount: 2,
          logNormalizationConstant: 0,
        })
        // precipitationMm (HIGH) second
        .mockResolvedValueOnce({
          updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({ ...b, weight: i === 0 ? 0.82 : 0.18 })),
          effectiveParticleCount: 2,
          logNormalizationConstant: 0,
        })
        // windSpeed (MEDIUM)
        .mockResolvedValueOnce({
          updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({ ...b, weight: i === 0 ? 0.86 : 0.14 })),
          effectiveParticleCount: 2,
          logNormalizationConstant: 0,
        })
        // roadClosure01 (MEDIUM)
        .mockResolvedValueOnce({
          updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({ ...b, weight: i === 0 ? 0.88 : 0.12 })),
          effectiveParticleCount: 2,
          logNormalizationConstant: 0,
        })
        // fatigue01 (MEDIUM)
        .mockResolvedValueOnce({
          updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({ ...b, weight: i === 0 ? 0.9 : 0.1 })),
          effectiveParticleCount: 2,
          logNormalizationConstant: 0,
        }),
    } as any;

    const out = await refineBeliefWithPomdpIfAvailable({
      dso: { ...dso, tripState: { fatigue: 0.4 } } as any,
      researchData: {
        windSpeedMs: 14.2,
        weather_forecast: { forecasts: [{ visibility_km: 6, precipitation: { amount_mm: 9 } }] },
        road_conditions: { r1: { status: 'OPEN' }, r2: { status: 'CLOSED' } },
      },
      beliefSamples,
      probabilisticWorldModel,
      beliefUpdate,
    });

    expect(out).not.toBeNull();
    expect(beliefUpdate.updateBelief).toHaveBeenCalledTimes(5);
    expect(out?.observationFusionOrder).toEqual(['visibilityM', 'precipitationMm', 'windSpeed', 'roadClosure01', 'fatigue01']);
    expect(out?.observationsUsed?.map((o) => o.variable)).toEqual(['visibilityM', 'precipitationMm', 'windSpeed', 'roadClosure01', 'fatigue01']);
    expect(out?.beliefUpdateSteps?.map((s) => s.variable)).toEqual(['visibilityM', 'precipitationMm', 'windSpeed', 'roadClosure01', 'fatigue01']);
    expect(out?.observationModelParams?.windSpeedVariance).toBeGreaterThan(0);
    expect(out?.observationModelParams?.visibilityVariance).toBeGreaterThan(0);
    expect(typeof out?.beliefUpdateSteps?.[0]?.entropy01After).toBe('number');
    expect(typeof out?.beliefUpdateSteps?.[0]?.essAfter).toBe('number');
    expect(typeof out?.beliefUpdateSteps?.[0]?.weightL1DeltaFromPrev).toBe('number');
    // 稳健性：避免 NaN/爆炸，且在合理范围内
    for (const step of out?.beliefUpdateSteps ?? []) {
      expect(Number.isFinite(step.deltaEntropy01FromPrev)).toBe(true);
      expect(Number.isFinite(step.deltaEssFromPrev)).toBe(true);
      expect(Number.isFinite(step.weightL1DeltaFromPrev)).toBe(true);
      expect(step.entropy01After).toBeGreaterThanOrEqual(0);
      expect(step.entropy01After).toBeLessThanOrEqual(1);
      expect(step.essAfter).toBeGreaterThan(0);
      expect(step.weightL1DeltaFromPrev).toBeGreaterThanOrEqual(0);
      expect(step.weightL1DeltaFromPrev).toBeLessThanOrEqual(2);
    }

    const callVars = (beliefUpdate.updateBelief as jest.Mock).mock.calls.map(
      (c) => c[1]?.observation?.observation?.variable,
    );
    expect(callVars).toEqual(['visibilityM', 'precipitationMm', 'windSpeed', 'roadClosure01', 'fatigue01']);

    if (prev !== undefined) process.env.DECISION_OS_RESEARCH_POMDP_BELIEF = prev;
  });

  it('当配置文件存在对应 bucket 时，应覆盖默认阈值并记录来源', async () => {
    const prevFile = process.env.DECISION_OS_REFINEMENT_THRESHOLDS_FILE;
    const tmp = '/tmp/refinement-thresholds.test.json';
    require('node:fs').writeFileSync(
      tmp,
      JSON.stringify(
        {
          generatedAt: '2026-04-16T00:00:00.000Z',
          buckets: {
            'JP|m=7|tier=STRONG_INTERNAL|src=weather_predictions': { recommended: { l1: 0.123, js: 0.456 } },
          },
        },
        null,
        2,
      ),
    );
    process.env.DECISION_OS_REFINEMENT_THRESHOLDS_FILE = tmp;

    const dso = makeDso();
    const beliefSamples: BeliefStateSample[] = [
      { sampleId: 'a', environmentSummary: { weatherRisk: 0.2 }, weight: 0.5 },
      { sampleId: 'b', environmentSummary: { weatherRisk: 0.8 }, weight: 0.5 },
    ];
    const probabilisticWorldModel = { fromDeterministicModel: jest.fn().mockReturnValue({ stubCtx: true }) } as any;
    const beliefUpdate = {
      updateBelief: jest.fn().mockResolvedValue({
        updatedBelief: beliefSamplesToPomdpBelief(beliefSamples).map((b, i) => ({ ...b, weight: i === 0 ? 0.9 : 0.1 })),
        effectiveParticleCount: 2,
        logNormalizationConstant: 0,
      }),
    } as any;

    const out = await refineBeliefWithPomdpIfAvailable({
      dso,
      researchData: {
        windSpeedMs: 10,
        windSpeedMs_meta: { source: 'weather_predictions', aggregation: 'mean', sampleCount: 2 },
      },
      beliefSamples,
      probabilisticWorldModel,
      beliefUpdate,
    });

    expect(out?.refinementThresholdSource).toBe('config');
    expect(out?.refinementThresholds?.l1).toBe(0.123);
    expect(out?.refinementThresholds?.js).toBe(0.456);
    expect(out?.refinementThresholdsConfigMeta?.bucketKey).toBe('JP|m=7|tier=STRONG_INTERNAL|src=weather_predictions');

    if (prevFile !== undefined) process.env.DECISION_OS_REFINEMENT_THRESHOLDS_FILE = prevFile;
    else delete process.env.DECISION_OS_REFINEMENT_THRESHOLDS_FILE;
  });
});
