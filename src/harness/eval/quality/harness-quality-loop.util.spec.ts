import {
  buildHarnessQualityLoopSnapshot,
  buildHarnessQualitySampleObservability,
  parseHarnessQualitySampleRate,
  shouldSampleHarnessQuality,
} from './harness-quality-loop.util';

describe('harness-quality-loop.util', () => {
  it('parses quality sample rate', () => {
    expect(parseHarnessQualitySampleRate({ HARNESS_QUALITY_SAMPLE_RATE: '0.1' })).toBe(0.1);
    expect(parseHarnessQualitySampleRate({})).toBe(0);
  });

  it('samples deterministically by requestId', () => {
    const rate = 0.5;
    const a = shouldSampleHarnessQuality('req-stable-a', rate);
    const b = shouldSampleHarnessQuality('req-stable-a', rate);
    expect(a).toBe(b);
  });

  it('builds observability slice', () => {
    const slice = buildHarnessQualitySampleObservability({
      requestId: 'req-1',
      sampleRate: 1,
    });
    expect(slice.schemaId).toBe('tripnara.harness_quality_sample@v1');
    expect(slice.sampled).toBe(true);
  });

  it('builds snapshot with blockers when lint off', () => {
    const snap = buildHarnessQualityLoopSnapshot({
      decisionClosureFixtureCount: 5,
      env: {},
    });
    expect(snap.ops_readiness.ready).toBe(false);
    expect(snap.ops_readiness.blockers).toContain('ORCHESTRATOR_CONTEXT_LINT_ENABLED_off');
  });
});
