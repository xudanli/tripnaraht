import { ParallelDecisionKernel, computeCvar } from './parallel-decision-kernel';

describe('parallel-decision-kernel', () => {
  jest.setTimeout(30000);

  it('computeCvar matches worst-tail average', () => {
    const items = [
      { weight: 0.5, value: 10 },
      { weight: 0.5, value: 0 },
    ];
    // alpha=0.5 => tail=0.5 => CVaR = worst 50% = 10
    expect(computeCvar(items, 0.5)).toBeCloseTo(10, 6);
  });

  it('evaluates scenarios in parallel and aggregates E + beta*CVaR', async () => {
    const kernel = new ParallelDecisionKernel({ poolSize: 2 });
    const samples = Array.from({ length: 10 }).map((_, i) => ({
      sampleId: `s${i}`,
      weight: 1,
      environmentSummary: { weatherRisk: i < 5 ? 0.1 : 0.9 },
    }));
    const edges: any[] = [
      {
        edge: {
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          exposure: 1,
          surface_type: 'mud',
        },
      },
    ];

    const out = await kernel.evaluateRiskStochastic({
      samples: samples as any,
      edges,
      envDefaults: { weatherRisk01: 0.2 },
      alpha: 0.95,
      beta: 0.5,
      batchSize: 4,
    });

    expect(out.aggregate.n).toBe(10);
    expect(out.aggregate.expectedRiskCost).toBeGreaterThan(0);
    expect(out.aggregate.cvarRiskCost).toBeGreaterThanOrEqual(out.aggregate.expectedRiskCost);
    await kernel.close();
  });

  it('reduces samples by weather quantiles and keeps extreme tail', () => {
    const kernel = new ParallelDecisionKernel({ poolSize: 1 });
    const samples = Array.from({ length: 100 }).map((_, i) => ({
      sampleId: `s${i}`,
      weight: 1,
      environmentSummary: { weatherRisk: i / 99 },
    }));
    const reduced = kernel.reduceSamplesByWeatherQuantiles({
      samples: samples as any,
      envWeatherRiskFallback01: 0.2,
      targetN: 20,
    });
    expect(reduced.samples.length).toBe(20);
    // ensure some tail sample exists (weatherRisk close to 1)
    const max = Math.max(...reduced.samples.map((s: any) => s.environmentSummary.weatherRisk));
    expect(max).toBeGreaterThan(0.9);
  });

  it('diagnoses worst-tail drivers using explainEdgeRisk aggregation', async () => {
    const kernel = new ParallelDecisionKernel({ poolSize: 2 });
    const samples = Array.from({ length: 20 }).map((_, i) => ({
      sampleId: `s${i}`,
      weight: 1,
      environmentSummary: { weatherRisk: i < 2 ? 0.95 : 0.1 }, // a small tail of bad weather
    }));
    const edges: any[] = [
      {
        edge: {
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          exposure: 1,
          surface_type: 'mud',
          water_crossing_depth_cm: 80,
          f_road_level: 'F208',
        },
      },
    ];
    const out = await kernel.evaluateRiskStochastic({
      samples: samples as any,
      edges,
      envDefaults: { weatherRisk01: 0.2, windSpeedMs: 18.2 },
      alpha: 0.95,
      beta: 0.5,
      batchSize: 10,
    });
    const report = kernel.identifyFailureDrivers({
      perScenario: out.perScenario,
      samples: samples as any,
      edges,
      envDefaults: { weatherRisk01: 0.2, windSpeedMs: 18.2 },
      alpha: 0.95,
      topMEdges: 1,
    });
    expect(report.topFactors.map((x) => x.factor)).toEqual(expect.arrayContaining(['water_crossing_depth_cm', 'f_road_level']));
    expect(report.bullets.join(' ')).toMatch(/涉水|高地/);
    expect(report.topEdges?.length).toBe(1);
    await kernel.close();
  });
});

