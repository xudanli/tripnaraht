import {
  buildMetricsOverlay,
  computeLatencyGrowthPct,
  createLatencyBaseline,
  percentile,
  sumCounter,
} from './production-observation-metrics.collector';

describe('production-observation-metrics.collector', () => {
  it('computes p95 and growth from probes', () => {
    const probes = [
      { endpoint: 'a', ok: true, durationMs: 100 },
      { endpoint: 'b', ok: true, durationMs: 200 },
      { endpoint: 'c', ok: true, durationMs: 300 },
    ];
    const baseline = createLatencyBaseline(probes);
    expect(baseline.p95Ms).toBe(300);
    expect(computeLatencyGrowthPct(330, baseline)).toBe(10);
  });

  it('builds overlay with prometheus counters', () => {
    const overlay = buildMetricsOverlay({
      probes: [{ endpoint: 'health', ok: true, durationMs: 50 }],
      baseline: createLatencyBaseline([{ endpoint: 'health', ok: true, durationMs: 50 }]),
      prometheus: [
        {
          name: 'tripnara_dos_tick_total',
          type: 'counter',
          values: [{ value: 12 }],
        },
        {
          name: 'tripnara_gate_evaluations_total',
          type: 'counter',
          values: [{ value: 100 }],
        },
        {
          name: 'tripnara_gate_blocks_total',
          type: 'counter',
          values: [{ value: 1 }],
        },
      ],
      source: 'test',
    });

    expect(overlay.monitoring?.eventsProcessed).toBe(12);
    expect(overlay.latency?.gatewayErrorRatePct).toBe(1);
    expect(overlay.latency?.p95GrowthPct).toBe(0);
  });

  it('percentile handles empty input', () => {
    expect(percentile([], 95)).toBe(0);
    expect(sumCounter(undefined)).toBe(0);
  });
});
