import { LabBenchmarkService } from './lab-benchmark.service';

describe('LabBenchmarkService', () => {
  const prev = process.env.DECISION_LAB_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.DECISION_LAB_ENABLED;
    else process.env.DECISION_LAB_ENABLED = prev;
  });

  it('returns empty when disabled', async () => {
    process.env.DECISION_LAB_ENABLED = '0';
    const svc = new LabBenchmarkService();
    const summary = await svc.runBenchmark({ fixtureIds: [], seed: 1, strategyIds: [] });
    expect(summary.records).toHaveLength(0);
  });

  it('runs iceland minimal when enabled', async () => {
    process.env.DECISION_LAB_ENABLED = '1';
    const svc = new LabBenchmarkService();
    const summary = await svc.runBenchmark({
      fixtureIds: ['iceland_guide_minimal_v1'],
      seed: 42,
      strategyIds: ['legacy-frozen'],
    });
    expect(summary.records).toHaveLength(1);
    expect(summary.records[0]?.result.recommendedCandidateId).toBe('balanced');
  });

  it('compares legacy-frozen vs cp-sat-lex on multi-candidate fixture', async () => {
    process.env.DECISION_LAB_ENABLED = '1';
    const svc = new LabBenchmarkService();
    const summary = await svc.runBenchmark({
      fixtureIds: ['iceland_guide_minimal_v1'],
      seed: 42,
      strategyIds: ['legacy-frozen', 'cp-sat-lexicographic'],
    });
    expect(summary.records.length).toBeGreaterThanOrEqual(2);
    expect(summary.comparisons.length).toBe(1);
    expect(summary.comparisons[0]?.cpSatLexSelectedId).toBe('balanced');
    expect(summary.comparisons[0]?.cpSatSolverEngine).toBe('cp-sat-lex-v1');
  });

  it('compares cp-sat-lex-v1 vs lex-rank-v0 engines', async () => {
    process.env.DECISION_LAB_ENABLED = '1';
    const svc = new LabBenchmarkService();
    const summary = await svc.runBenchmark({
      fixtureIds: ['iceland_guide_minimal_v1'],
      seed: 42,
      strategyIds: ['cp-sat-lex-v1', 'lex-rank-v0'],
    });
    expect(summary.records.length).toBe(2);
    const ab = summary.comparisons.find((c) => c.engineAbDiverged != null);
    expect(ab?.cpSatEngineV1SelectedId).toBe('balanced');
    expect(ab?.engineAbDiverged).toBe(false);
  });
});
